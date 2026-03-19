import type { Context } from "hono";
import { payRequest } from "../payments/payer.js";
import { PaymentTracker, type TxEvent } from "../payments/tracker.js";
import { ServiceStore } from "../discovery/store.js";
import { selectProvider, markFailed } from "../routing/selector.js";
import { getIntentDef } from "../routing/intents.js";

export class RequestHandler {
  constructor(
    private store: ServiceStore,
    private tracker: PaymentTracker
  ) {}

  async handleIntent(c: Context): Promise<Response> {
    const intent = c.req.param("intent");
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

    // Execute paid request
    const result = await payRequest(url, method, {}, body);

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
          switchboard: { intent, routed_to: chosen.serviceId, alternatives: selection.alternatives.map((a) => a.serviceId) },
        },
        result.statusCode === 402 ? 402 : 502
      );
    }

    // Return response with switchboard headers
    const headers: Record<string, string> = {
      "X-Switchboard-Intent": intent,
      "X-Switchboard-Provider": chosen.serviceName,
      "X-Switchboard-ServiceId": chosen.serviceId,
    };
    if (savedVsNext != null) {
      headers["X-Switchboard-Saved"] = `$${savedVsNext.toFixed(4)}`;
    }
    if (chosen.priceUsd != null) {
      headers["X-Switchboard-Price"] = `$${chosen.priceUsd.toFixed(4)}`;
    }

    const responseBody = typeof result.response === "string" ? result.response : JSON.stringify(result.response);
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    });
  }

  async handleDirect(c: Context): Promise<Response> {
    // Extract target from path: /proxy/parallelmpp.dev/api/search -> https://parallelmpp.dev/api/search
    const path = c.req.path.replace(/^\/proxy\//, "");
    const qs = new URLSearchParams(c.req.query()).toString();
    const targetUrl = `https://${path}${qs ? "?" + qs : ""}`;
    const method = c.req.method;

    let body: string | undefined;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        body = await c.req.text();
      } catch {}
    }

    // Look up which service this is for savings tracking
    const match = this.store.findByUrl(targetUrl);

    const result = await payRequest(targetUrl, method, {}, body);

    const txEvent: TxEvent = {
      timestamp: new Date(),
      intent: match?.intent || "direct",
      provider: match?.provider.serviceName || path.split("/")[0],
      serviceId: match?.provider.serviceId || "unknown",
      url: targetUrl,
      method,
      amount: match?.provider.priceUsd || null,
      savedVsNext: null, // No savings calc for direct mode
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

    const responseBody = typeof result.response === "string" ? result.response : JSON.stringify(result.response);
    return new Response(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Switchboard-Mode": "direct",
        "X-Switchboard-Provider": match?.provider.serviceName || "unknown",
      },
    });
  }
}
