import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { ServiceStore } from "../discovery/store.js";
import { PaymentTracker } from "../payments/tracker.js";
import { RequestHandler } from "./handler.js";
import { getDashboardHtml, createEventStream } from "../dashboard/web.js";
import { calculateChargeUsd } from "../payments/pricing.js";
import { createPaymentHandler, createMcpPaymentHandler } from "../payments/receiver.js";
import { handleMcpRequest, type McpDeps } from "../mcp/server.js";

const PORT = parseInt(process.env.PORT || "3402", 10) || 3402;

export type PaymentMode = "paid" | "auth" | "free";

export function startProxy(
  store: ServiceStore,
  tracker: PaymentTracker,
  paymentMode: PaymentMode = "free"
): { close: () => void } {
  const app = new Hono();
  const handler = new RequestHandler(store, tracker, paymentMode);

  // Initialize payment handler for paid mode
  if (paymentMode === "paid") {
    const mppx = createPaymentHandler();
    handler.setPaymentHandler(mppx);
  }

  // MCP endpoint — CORS + auth + handler
  const mcpDeps: McpDeps = {
    store,
    tracker,
    paymentMode,
    mcpPayment: paymentMode === "paid" ? createMcpPaymentHandler() : null,
  };

  app.use("/mcp", cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }));

  app.all("/mcp", async (c) => {
    if (paymentMode === "auth" && apiKey) {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${apiKey}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    return handleMcpRequest(c.req.raw, mcpDeps);
  });

  // Request logging
  app.use("*", async (c, next) => {
    const start = Date.now();
    await next();
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`);
  });

  // Auth middleware for spending routes (auth mode only)
  const apiKey = process.env.API_KEY;
  if (paymentMode === "auth" && apiKey) {
    app.use("/intent/*", async (c, next) => {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${apiKey}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
    app.use("/proxy/*", async (c, next) => {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${apiKey}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
  }

  // Web dashboard (read-only, no auth)
  app.get("/", (c) => c.html(getDashboardHtml(paymentMode)));

  // SSE events — auth-gate when API_KEY is set
  app.get("/events", (c) => {
    if (apiKey) {
      const auth = c.req.header("authorization");
      if (auth !== `Bearer ${apiKey}`) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }
    return createEventStream(c, tracker);
  });

  // Health check
  app.get("/health", (c) =>
    c.json({ status: "ok", services: store.getServiceCount(), intents: store.getAllIntents().length, paymentMode })
  );

  // Price index — shows router prices (with markup) in paid mode, raw upstream prices otherwise
  app.get("/prices", (c) => {
    const all = store.getAllProviders();
    return c.json(
      all.map((ip) => ({
        intent: ip.intent,
        providers: ip.providers.map((p) => ({
          service: p.serviceName,
          serviceId: p.serviceId,
          endpoint: `${p.endpoint.method} ${p.endpoint.path}`,
          priceUsd: paymentMode === "paid" ? calculateChargeUsd(p.priceUsd) : p.priceUsd,
        })),
      }))
    );
  });

  // Compare providers for a specific intent — strip serviceUrl
  app.get("/compare/:intent", (c) => {
    const intent = c.req.param("intent");
    const providers = store.getProviders(intent);
    if (providers.length === 0) {
      return c.json({ error: `No providers for intent: ${intent}`, available: store.getAllIntents() }, 404);
    }
    return c.json({
      intent,
      providers: providers.map((p) => ({
        service: p.serviceName,
        serviceId: p.serviceId,
        endpoint: `${p.endpoint.method} ${p.endpoint.path}`,
        priceUsd: paymentMode === "paid" ? calculateChargeUsd(p.priceUsd) : p.priceUsd,
      })),
    });
  });

  // Stats — strip responsePreview and url
  app.get("/stats", (c) => {
    const recentTxs = tracker.getTransactions(10).map((tx) => {
      const { responsePreview, url, ...safe } = tx;
      return safe;
    });
    return c.json({
      totalSpent: tracker.getTotalSpent(),
      totalSaved: tracker.getTotalSaved(),
      savingsPercent: tracker.getSavingsPercent(),
      transactionCount: tracker.getTransactionCount(),
      recentTransactions: recentTxs,
      // Revenue stats (meaningful in paid mode)
      totalCharged: tracker.getTotalCharged(),
      totalRevenue: tracker.getTotalRevenue(),
      totalLoss: tracker.getTotalLoss(),
      marginPercent: tracker.getMarginPercent(),
      paymentMode,
    });
  });

  // Intent-based routing
  app.all("/intent/:intent", (c) => handler.handleIntent(c));

  // Direct proxy pass-through
  app.all("/proxy/*", (c) => handler.handleDirect(c));

  const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
    // Server started — logging handled by caller
  });

  return {
    close: () => {
      (server as any).close?.();
    },
  };
}

export { PORT };
