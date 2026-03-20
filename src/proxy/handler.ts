import type { Context } from "hono";
import { payRequest } from "../payments/payer.js";
import { PaymentTracker, type TxEvent } from "../payments/tracker.js";
import { ServiceStore } from "../discovery/store.js";
import { selectProvider, markFailed } from "../routing/selector.js";
import { getIntentDef } from "../routing/intents.js";

/** Headers safe to forward from caller to upstream */
const FORWARDED_HEADERS = ["content-type", "accept", "user-agent"];

export class RequestHandler {
  constructor(
    private store: ServiceStore,
    private tracker: PaymentTracker
  ) {}

  async handleIntent(c: Context): Promise<Response> {
    try {
      const intent = c.req.param("intent") as string;
      const params = c.req.query();

      // Budget check
      if (this.tracker.isOverBudget()) {
        return c.json({ error: "Budget exceeded", spent: this.tracker.getTotalSpent() }, 402);
      }

      const selection = selectProvider(intent, this.store);
      if (!selection) {
        return c.json({ error: `No providers found for intent: ${intent}`, available: this.store.getAllIntents() }, 404);
      }

      const { chosen, savedVsNext } = selection;
      const intentDef = getIntentDef(intent);

      // Build request
      let url: string;
      let method: string;
      let body: string | undefined;

      if (intentDef?.buildUrl) {
        const built = intentDef.buildUrl(
          { serviceUrl: chosen.serviceUrl, endpointPath: chosen.endpoint.path },
          params
        );
        url = built.url;
        method = built.method;
        body = built.body;
      } else {
        // Default: append query params to endpoint
        const qs = new URLSearchParams(params).toString();
        url = `${chosen.serviceUrl}${chosen.endpoint.path}${qs ? "?" + qs : ""}`;
        method = chosen.endpoint.method || intentDef?.defaultMethod || "GET";
      }

      // If there's a raw body in the request, forward it
      if (c.req.method === "POST" && !body) {
        try {
          body = await c.req.text();
          if (body) method = "POST";
        } catch {}
      }

      // Forward relevant caller headers
      const forwardHeaders = extractForwardHeaders(c);

      // Execute paid request
      const result = await payRequest(url, method, forwardHeaders, body);

      // Record transaction
      const txEvent: TxEvent = {
        timestamp: new Date(),
        intent,
        provider: chosen.serviceName,
        serviceId: chosen.serviceId,
        url,
        method,
        amount: chosen.priceUsd,
        savedVsNext: savedVsNext,
        status: result.success ? "success" : result.statusCode === 402 ? "payment_error" : "service_error",
        latencyMs: result.latencyMs,
        responsePreview: typeof result.response === "string"
          ? result.response.slice(0, 100)
          : JSON.stringify(result.response)?.slice(0, 100),
      };
      this.tracker.record(txEvent);

      if (!result.success) {
        markFailed(chosen.serviceId);
        return c.json(
          {
            error: result.error,
            provider: chosen.serviceName,
            mpprouter: { intent, routed_to: chosen.serviceId, alternatives: selection.alternatives.map((a) => a.serviceId) },
          },
          result.statusCode === 402 ? 402 : 502
        );
      }

      // Return response with mpprouter headers
      const headers: Record<string, string> = {
        "Content-Type": result.contentType,
        "X-MppRouter-Intent": intent,
        "X-MppRouter-Provider": chosen.serviceName,
        "X-MppRouter-ServiceId": chosen.serviceId,
      };
      if (savedVsNext != null) {
        headers["X-MppRouter-Saved"] = `$${savedVsNext.toFixed(4)}`;
      }
      if (chosen.priceUsd != null) {
        headers["X-MppRouter-Price"] = `$${chosen.priceUsd.toFixed(4)}`;
      }

      return new Response(result.responseRaw, {
        status: result.statusCode,
        headers,
      });
    } catch (err: any) {
      console.error("handleIntent error:", err?.message);
      return c.json({ error: "Internal proxy error" }, 502);
    }
  }

  async handleDirect(c: Context): Promise<Response> {
    try {
      // Extract target from path: /proxy/parallelmpp.dev/api/search -> https://parallelmpp.dev/api/search
      const path = c.req.path.replace(/^\/proxy\//, "");

      // Validate non-empty path
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

      const method = c.req.method;

      let body: string | undefined;
      if (method === "POST" || method === "PUT" || method === "PATCH") {
        try {
          body = await c.req.text();
        } catch {}
      }

      // Forward relevant caller headers
      const forwardHeaders = extractForwardHeaders(c);

      // Look up which service this is for savings tracking
      const match = this.store.findByUrl(targetUrl);

      const result = await payRequest(targetUrl, method, forwardHeaders, body);

      const txEvent: TxEvent = {
        timestamp: new Date(),
        intent: match?.intent || "direct",
        provider: match?.provider.serviceName || path.split("/")[0],
        serviceId: match?.provider.serviceId || "unknown",
        url: targetUrl,
        method,
        amount: match?.provider.priceUsd || null,
        savedVsNext: null,
        status: result.success ? "success" : "service_error",
        latencyMs: result.latencyMs,
        responsePreview: typeof result.response === "string"
          ? result.response.slice(0, 100)
          : JSON.stringify(result.response)?.slice(0, 100),
      };
      this.tracker.record(txEvent);

      if (!result.success) {
        return c.json({ error: result.error, url: targetUrl }, result.statusCode === 402 ? 402 : 502);
      }

      return new Response(result.responseRaw, {
        status: result.statusCode,
        headers: {
          "Content-Type": result.contentType,
          "X-MppRouter-Mode": "direct",
          "X-MppRouter-Provider": match?.provider.serviceName || "unknown",
        },
      });
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
