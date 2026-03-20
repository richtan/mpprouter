import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod/v4";
import { ServiceStore } from "../discovery/store.js";
import { PaymentTracker } from "../payments/tracker.js";
import { selectProvider } from "../routing/selector.js";
import { getIntentDef } from "../routing/intents.js";
import { executeIntent } from "../routing/executor.js";
import { calculateChargeUsd, usdToTokenAmount } from "../payments/pricing.js";
import { extractMcpPinnedProvider, type McpPaymentHandler } from "../payments/receiver.js";
import type { PaymentMode } from "../proxy/server.js";

export interface McpDeps {
  store: ServiceStore;
  tracker: PaymentTracker;
  paymentMode: PaymentMode;
  mcpPayment: McpPaymentHandler | null;
}

/** Input schemas per intent type */
const WEB_SEARCH_SCHEMA = { query: z.string().describe("Search query"), num_results: z.number().optional().describe("Number of results") };
const SCRAPE_SCHEMA = { url: z.string().describe("URL to scrape") };
const GENERIC_SCHEMA = { body: z.record(z.string(), z.unknown()).optional().describe("JSON body to forward to upstream provider") };

/** Map MCP tool args to intent params/body */
function mapArgsToIntent(intentName: string, args: Record<string, any>): { params: Record<string, string>; body?: string } {
  switch (intentName) {
    case "web_search":
      return {
        params: {
          q: args.query || "",
          ...(args.num_results != null ? { num: String(args.num_results) } : {}),
        },
      };
    case "scrape":
      return { params: { url: args.url || "" } };
    default:
      return {
        params: {},
        body: args.body ? JSON.stringify(args.body) : undefined,
      };
  }
}

export async function handleMcpRequest(req: Request, deps: McpDeps): Promise<Response> {
  const { store, tracker, paymentMode, mcpPayment } = deps;

  // Create per-request McpServer (stateless pattern from official Hono example)
  const server = new McpServer({ name: "mpprouter", version: "1.0.0" });

  // Register one tool per available intent
  const intents = store.getAllIntents();
  for (const intentName of intents) {
    const providers = store.getProviders(intentName);
    if (providers.length === 0) continue;

    const intentDef = getIntentDef(intentName);
    const description = intentDef?.description || intentName;
    const inputSchema = intentName === "web_search" ? WEB_SEARCH_SCHEMA
      : intentName === "scrape" ? SCRAPE_SCHEMA
      : GENERIC_SCHEMA;

    server.registerTool(intentName, { description, inputSchema }, async (args: Record<string, any>, extra: any) => {
      const { params, body } = mapArgsToIntent(intentName, args);

      // Select provider ONCE (used for both pricing and execution)
      const pinnedId = extractMcpPinnedProvider(extra);
      const selection = selectProvider(intentName, store, pinnedId);
      if (!selection) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `No providers for intent: ${intentName}` }) }], isError: true };
      }

      // Payment gate (paid mode)
      if (paymentMode === "paid" && mcpPayment) {
        const chargedUsd = calculateChargeUsd(selection.chosen.priceUsd);
        const amount = usdToTokenAmount(chargedUsd);
        const payResult = await mcpPayment.charge({
          amount,
          description: `mpprouter: ${intentName} via ${selection.chosen.serviceName}`,
          meta: { providerId: selection.chosen.serviceId },
        })(extra);

        if (payResult.status === 402) {
          throw payResult.challenge; // McpError -32042
        }

        const result = await executeIntent(
          { intent: intentName, params, body, selection, chargedAmount: chargedUsd },
          store, tracker
        );
        return payResult.withReceipt({
          content: [{ type: "text" as const, text: result.responseRaw }],
          isError: !result.success,
        });
      }

      // Free/auth mode — no payment gate
      const result = await executeIntent(
        { intent: intentName, params, body, selection },
        store, tracker
      );
      return { content: [{ type: "text" as const, text: result.responseRaw }], isError: !result.success };
    });
  }

  // Create per-request transport (stateless — no sessionIdGenerator)
  const transport = new WebStandardStreamableHTTPServerTransport();
  await server.connect(transport);

  return transport.handleRequest(req);
}
