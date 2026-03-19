import { loadServices } from "./discovery/loader.js";
import { ServiceStore } from "./discovery/store.js";
import { PaymentTracker } from "./payments/tracker.js";
import { startProxy, PORT } from "./proxy/server.js";
import { startDashboard } from "./dashboard/tui.js";

const BANNER = `
{bold}{cyan-fg}
 ╔═══════════════════════════════════════════════╗
 ║   ⚡ SWITCHBOARD — Intelligent MPP Router ⚡  ║
 ╚═══════════════════════════════════════════════╝
{/cyan-fg}{/bold}`;

async function main() {
  // Check for --no-tui flag
  const noTui = process.argv.includes("--no-tui");

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
  tracker.setBudget(5.0); // $5 budget for demo

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
    // Add info to the screen after rendering
    // The banner and service info are shown through the dashboard widgets
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
