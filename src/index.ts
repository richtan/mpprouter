import { loadServices } from "./discovery/loader.js";
import { ServiceStore } from "./discovery/store.js";
import { PaymentTracker } from "./payments/tracker.js";
import { startProxy, PORT } from "./proxy/server.js";
import { startDashboard } from "./dashboard/tui.js";

const BANNER = `
{bold}{cyan-fg}
 ╔═════════════════════════════╗
 ║      ⚡ MPP ROUTER ⚡      ║
 ╚═════════════════════════════╝
{/cyan-fg}{/bold}`;

async function main() {
  // Auto-detect production: force --no-tui when no TTY available
  const isProduction = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === "production";
  const noTui = process.argv.includes("--no-tui") || isProduction;

  // Step 1: Load services
  if (noTui) console.log("Loading MPP services...");
  const services = loadServices();
  const store = new ServiceStore(services);
  const intents = store.getAllIntents();

  if (noTui) {
    console.log(`Loaded ${services.length} services, ${intents.length} intents`);
    console.log(`Intents: ${intents.join(", ")}`);
  }

  // Step 2: Setup tracker
  const tracker = new PaymentTracker();
  const budget = parseFloat(process.env.BUDGET || "5") || 5;
  tracker.setBudget(budget);

  if (noTui) {
    // Console-only mode: log transactions to stdout
    tracker.on("transaction", (event) => {
      const status = event.status === "success" ? "✓" : "✗";
      const savings = event.savedVsNext != null && event.savedVsNext > 0 ? ` (saved $${event.savedVsNext.toFixed(3)})` : "";
      const price = event.amount != null ? `$${event.amount.toFixed(4)}` : "$?.??";
      console.log(`${status} ${event.intent} → ${event.provider} ${price}${savings} [${event.latencyMs}ms]`);
    });
  }

  // Step 3: Start proxy
  const proxy = startProxy(store, tracker);
  if (noTui) console.log(`Proxy listening on http://localhost:${PORT}`);

  // Step 4: Start dashboard (unless --no-tui)
  if (!noTui) {
    const { screen } = startDashboard(tracker, store);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    proxy.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    proxy.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
