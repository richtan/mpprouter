import { payRequest, type PaymentResult } from "../payments/payer.js";
import { PaymentTracker, type TxEvent } from "../payments/tracker.js";
import { ServiceStore } from "../discovery/store.js";
import type { Selection } from "./selector.js";
import { markFailed } from "./selector.js";
import { getIntentDef } from "./intents.js";
import { getMarkupUsd, MARKUP_DEFAULT } from "../payments/pricing.js";

export interface ExecuteIntentParams {
  intent: string;
  params: Record<string, string>;
  body?: string;
  forwardHeaders?: Record<string, string>;
  selection: Selection;
  chargedAmount?: number | null;
}

export interface ExecuteIntentResult {
  success: boolean;
  statusCode: number;
  responseRaw: string;
  contentType: string;
  error?: string;
  latencyMs: number;
  chosen: { serviceName: string; serviceId: string; priceUsd: number | null };
  savedVsNext: number | null;
  alternatives: string[];
}

export async function executeIntent(
  p: ExecuteIntentParams,
  store: ServiceStore,
  tracker: PaymentTracker,
): Promise<ExecuteIntentResult> {
  const { intent, params, selection, chargedAmount } = p;
  const { chosen, savedVsNext } = selection;
  const intentDef = getIntentDef(intent);

  // Build request
  let url: string;
  let method: string;
  let body: string | undefined = p.body;

  if (intentDef?.buildUrl) {
    const built = intentDef.buildUrl(
      { serviceUrl: chosen.serviceUrl, endpointPath: chosen.endpoint.path },
      params
    );
    url = built.url;
    method = built.method;
    body = built.body;
  } else {
    const qs = new URLSearchParams(params).toString();
    url = `${chosen.serviceUrl}${chosen.endpoint.path}${qs ? "?" + qs : ""}`;
    method = chosen.endpoint.method || intentDef?.defaultMethod || "GET";
  }

  // If caller provided a body and buildUrl didn't produce one, use it
  if (p.body && !body) {
    body = p.body;
    method = "POST";
  }

  // Execute upstream request
  const result = await payRequest(url, method, p.forwardHeaders || {}, body);

  // Use MARKUP_DEFAULT as estimated cost for budget tracking when price is unknown
  const trackingAmount = chosen.priceUsd ?? MARKUP_DEFAULT;

  // Record transaction
  const revenue = chargedAmount != null ? getMarkupUsd(chosen.priceUsd, chargedAmount) : null;
  const txEvent: TxEvent = {
    timestamp: new Date(),
    intent,
    provider: chosen.serviceName,
    serviceId: chosen.serviceId,
    url,
    method,
    amount: result.success ? trackingAmount : (chosen.priceUsd ?? null),
    savedVsNext: savedVsNext,
    status: result.success ? "success" : result.statusCode === 402 ? "payment_error" : "service_error",
    latencyMs: result.latencyMs,
    responsePreview: typeof result.response === "string"
      ? result.response.slice(0, 100)
      : JSON.stringify(result.response)?.slice(0, 100),
    chargedAmount: chargedAmount ?? null,
    revenue: result.success ? revenue : null,
  };
  tracker.record(txEvent);

  if (!result.success) {
    if (chargedAmount != null) {
      console.warn(
        `[LOSS] Upstream failed after payment: intent=${intent} provider=${chosen.serviceId} charged=$${chargedAmount.toFixed(4)} status=${result.statusCode}`
      );
    }
    markFailed(chosen.serviceId);
  }

  return {
    success: result.success,
    statusCode: result.statusCode,
    responseRaw: result.responseRaw,
    contentType: result.contentType,
    error: result.error,
    latencyMs: result.latencyMs,
    chosen: { serviceName: chosen.serviceName, serviceId: chosen.serviceId, priceUsd: chosen.priceUsd },
    savedVsNext,
    alternatives: selection.alternatives.map((a) => a.serviceId),
  };
}
