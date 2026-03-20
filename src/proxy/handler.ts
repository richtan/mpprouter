import type { Context } from "hono";
import { payRequest } from "../payments/payer.js";
import { PaymentTracker, type TxEvent } from "../payments/tracker.js";
import { ServiceStore } from "../discovery/store.js";
import { selectProvider } from "../routing/selector.js";
import { calculateChargeUsd, usdToTokenAmount, getMarkupUsd, MARKUP_DEFAULT } from "../payments/pricing.js";
import { type PaymentHandler, extractPinnedProvider } from "../payments/receiver.js";
import { executeIntent } from "../routing/executor.js";

/** Headers safe to forward from caller to upstream */
const FORWARDED_HEADERS = ["content-type", "accept", "user-agent"];

export class RequestHandler {
  private mppx: PaymentHandler | null = null;

  constructor(
    private store: ServiceStore,
    private tracker: PaymentTracker,
    private paymentMode: "paid" | "auth" | "free" = "free"
  ) {}

  setPaymentHandler(mppx: PaymentHandler) {
    this.mppx = mppx;
  }

  async handleIntent(c: Context): Promise<Response> {
    try {
      const intent = c.req.param("intent") as string;
      const params = c.req.query();

      // Budget check — return 503 (not 402) to avoid collision with payment challenges
      if (this.tracker.isOverBudget()) {
        return c.json({ error: "Router budget exceeded", spent: this.tracker.getTotalSpent() }, 503);
      }

      // Check for pinned provider from a previous 402 round-trip
      const authHeader = c.req.header("authorization");
      const pinnedProviderId = this.paymentMode === "paid" ? extractPinnedProvider(authHeader) : null;

      // Select provider ONCE (used for both pricing and execution)
      const selection = selectProvider(intent, this.store, pinnedProviderId);
      if (!selection) {
        return c.json({ error: `No providers found for intent: ${intent}`, available: this.store.getAllIntents() }, 404);
      }

      const { chosen, savedVsNext } = selection;

      // Payment gate (paid mode only)
      let chargedUsd: number | null = null;
      let paymentResult: any = null;

      if (this.paymentMode === "paid" && this.mppx) {
        chargedUsd = calculateChargeUsd(chosen.priceUsd);
        const amount = usdToTokenAmount(chargedUsd);
        const chargeHandler = this.mppx.charge({
          amount,
          description: `mpprouter: ${intent} via ${chosen.serviceName}`,
          meta: { providerId: chosen.serviceId },
        });

        paymentResult = await chargeHandler(c.req.raw);

        if (paymentResult.status === 402) {
          return paymentResult.challenge;
        }
      }

      // Read body if POST and not already consumed
      let body: string | undefined;
      if (c.req.method === "POST") {
        try {
          body = await c.req.text();
          if (!body) body = undefined;
        } catch {}
      }

      // Forward relevant caller headers
      const forwardHeaders = extractForwardHeaders(c);

      // Execute intent via shared executor
      const result = await executeIntent(
        { intent, params, body, forwardHeaders, selection, chargedAmount: chargedUsd },
        this.store, this.tracker
      );

      if (!result.success) {
        const errorResponse = c.json(
          {
            error: result.error,
            provider: result.chosen.serviceName,
            mpprouter: { intent, routed_to: result.chosen.serviceId, alternatives: result.alternatives },
          },
          502
        );
        return errorResponse;
      }

      // Build response with mpprouter headers
      const headers: Record<string, string> = {
        "Content-Type": result.contentType,
        "X-MppRouter-Intent": intent,
        "X-MppRouter-Provider": result.chosen.serviceName,
        "X-MppRouter-ServiceId": result.chosen.serviceId,
      };
      if (savedVsNext != null) {
        headers["X-MppRouter-Saved"] = `$${savedVsNext.toFixed(4)}`;
      }
      if (result.chosen.priceUsd != null) {
        headers["X-MppRouter-Price"] = `$${result.chosen.priceUsd.toFixed(4)}`;
      }

      const response = new Response(result.responseRaw, {
        status: result.statusCode,
        headers,
      });

      // Wrap with Payment-Receipt header if paid
      if (paymentResult && paymentResult.status === 200) {
        return paymentResult.withReceipt(response);
      }

      return response;
    } catch (err: any) {
      console.error("handleIntent error:", err?.message);
      return c.json({ error: "Internal proxy error" }, 502);
    }
  }

  async handleDirect(c: Context): Promise<Response> {
    try {
      // Extract target from path: /proxy/parallelmpp.dev/api/search -> https://parallelmpp.dev/api/search
      const path = c.req.path.replace(/^\/proxy\//, "");

      if (!path || path === "/") {
        return c.json({ error: "Missing target URL path" }, 400);
      }

      const qs = new URLSearchParams(c.req.query()).toString();
      const targetUrl = `https://${path}${qs ? "?" + qs : ""}`;

      // SSRF protection: only allow known service hosts
      let targetHost: string;
      try {
        targetHost = new URL(targetUrl).host;
      } catch {
        return c.json({ error: "Invalid target URL" }, 400);
      }

      const knownHosts = new Set(this.store.getServices().map((s) => new URL(s.service_url).host));
      if (!knownHosts.has(targetHost)) {
        return c.json({ error: "Unknown service host", host: targetHost }, 403);
      }

      // Budget check — return 503 (not 402)
      if (this.tracker.isOverBudget()) {
        return c.json({ error: "Router budget exceeded", spent: this.tracker.getTotalSpent() }, 503);
      }

      const reqMethod = c.req.method;

      let body: string | undefined;
      if (reqMethod === "POST" || reqMethod === "PUT" || reqMethod === "PATCH") {
        try {
          body = await c.req.text();
        } catch {}
      }

      const forwardHeaders = extractForwardHeaders(c);

      // Look up which service this is for pricing/tracking
      const match = this.store.findByUrl(targetUrl);
      const upstreamPrice = match?.provider.priceUsd ?? null;

      // Payment gate (paid mode)
      let chargedUsd: number | null = null;
      let paymentResult: any = null;

      if (this.paymentMode === "paid" && this.mppx) {
        chargedUsd = calculateChargeUsd(upstreamPrice);
        const amount = usdToTokenAmount(chargedUsd);
        const chargeHandler = this.mppx.charge({
          amount,
          description: `mpprouter: direct proxy to ${targetHost}`,
          meta: { targetUrl },
        });

        paymentResult = await chargeHandler(c.req.raw);

        if (paymentResult.status === 402) {
          return paymentResult.challenge;
        }
      }

      const result = await payRequest(targetUrl, reqMethod, forwardHeaders, body);

      // Use MARKUP_DEFAULT for budget tracking when price unknown
      const trackingAmount = upstreamPrice ?? MARKUP_DEFAULT;

      const revenue = chargedUsd != null ? getMarkupUsd(upstreamPrice, chargedUsd) : null;
      const txEvent: TxEvent = {
        timestamp: new Date(),
        intent: match?.intent || "direct",
        provider: match?.provider.serviceName || path.split("/")[0],
        serviceId: match?.provider.serviceId || "unknown",
        url: targetUrl,
        method: reqMethod,
        amount: result.success ? trackingAmount : (upstreamPrice ?? null),
        savedVsNext: null,
        status: result.success ? "success" : "service_error",
        latencyMs: result.latencyMs,
        responsePreview: typeof result.response === "string"
          ? result.response.slice(0, 100)
          : JSON.stringify(result.response)?.slice(0, 100),
        chargedAmount: chargedUsd,
        revenue: result.success ? revenue : null,
      };
      this.tracker.record(txEvent);

      if (!result.success) {
        if (chargedUsd != null) {
          console.warn(
            `[LOSS] Direct proxy failed after payment: url=${targetUrl} charged=$${chargedUsd.toFixed(4)} status=${result.statusCode}`
          );
        }
        return c.json({ error: result.error, url: targetUrl }, result.statusCode === 402 ? 502 : 502);
      }

      const response = new Response(result.responseRaw, {
        status: result.statusCode,
        headers: {
          "Content-Type": result.contentType,
          "X-MppRouter-Mode": "direct",
          "X-MppRouter-Provider": match?.provider.serviceName || "unknown",
        },
      });

      if (paymentResult && paymentResult.status === 200) {
        return paymentResult.withReceipt(response);
      }

      return response;
    } catch (err: any) {
      console.error("handleDirect error:", err?.message);
      return c.json({ error: "Internal proxy error" }, 502);
    }
  }
}

function extractForwardHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const val = c.req.header(name);
    if (val) headers[name] = val;
  }
  return headers;
}
