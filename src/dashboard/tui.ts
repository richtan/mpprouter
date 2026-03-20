import blessed from "blessed";
import contrib from "blessed-contrib";
import type { PaymentTracker, TxEvent } from "../payments/tracker.js";
import type { ServiceStore } from "../discovery/store.js";

export function startDashboard(tracker: PaymentTracker, store: ServiceStore) {
  const screen = blessed.screen({
    smartCSR: true,
    title: "MPP Router",
    fullUnicode: true,
  });

  const grid = new contrib.grid({ rows: 12, cols: 12, screen });

  // Top-left: Live transaction feed (log)
  const txLog = grid.set(0, 0, 6, 7, contrib.log, {
    label: " 📡 LIVE TRANSACTIONS ",
    fg: "green",
    selectedFg: "green",
    border: { type: "line", fg: "cyan" },
    style: {
      border: { fg: "cyan" },
      label: { fg: "white", bold: true },
    },
    bufferLength: 100,
    tags: true,
  });

  // Top-right: Savings summary (using a box with manual rendering)
  const savingsBox = grid.set(0, 7, 6, 5, blessed.box, {
    label: " 💰 SAVINGS ",
    border: { type: "line", fg: "cyan" },
    style: {
      fg: "white",
      border: { fg: "cyan" },
      label: { fg: "white", bold: true },
    },
    tags: true,
    content: formatSavings(0, 0, 0, null),
  });

  // Bottom-left: Price comparison (bar chart)
  const barChart = grid.set(6, 0, 6, 7, contrib.bar, {
    label: " 📊 PRICE COMPARISON (milli-$/request) ",
    barWidth: 8,
    barSpacing: 2,
    xOffset: 0,
    maxHeight: 100,
    border: { type: "line", fg: "cyan" },
    style: {
      border: { fg: "cyan" },
      label: { fg: "white", bold: true },
    },
  });

  // Bottom-right: Service table
  const serviceTable = grid.set(6, 7, 6, 5, contrib.table, {
    label: " 🗺️  SERVICE MAP ",
    keys: true,
    fg: "white",
    selectedFg: "white",
    selectedBg: "blue",
    interactive: false,
    border: { type: "line", fg: "cyan" },
    style: {
      border: { fg: "cyan" },
      label: { fg: "white", bold: true },
      header: { fg: "cyan", bold: true },
    },
    columnSpacing: 2,
    columnWidth: [12, 14, 8],
  });

  // Initialize price comparison bar chart
  updateBarChart(barChart, store);

  // Initialize service table
  updateServiceTable(serviceTable, store);

  // Show waiting state
  txLog.log("{cyan-fg}Waiting for requests...{/cyan-fg}");

  // Listen for transactions
  tracker.on("transaction", (event: TxEvent) => {
    const time = event.timestamp.toLocaleTimeString("en-US", { hour12: false });
    const status = event.status === "success" ? "{green-fg}✓{/green-fg}" : "{red-fg}✗{/red-fg}";
    const savings =
      event.savedVsNext != null && event.savedVsNext > 0
        ? ` {yellow-fg}(saved $${event.savedVsNext.toFixed(3)}){/yellow-fg}`
        : "";
    const price = event.amount != null ? `$${event.amount.toFixed(4)}` : "$?.??";

    txLog.log(
      `${status} {white-fg}${time}{/white-fg} {cyan-fg}${event.intent}{/cyan-fg} → {bold}${event.provider}{/bold} ${price}${savings} {gray-fg}${event.latencyMs}ms{/gray-fg}`
    );

    // Update savings box
    savingsBox.setContent(
      formatSavings(
        tracker.getTotalSpent(),
        tracker.getTotalSaved(),
        tracker.getTransactionCount(),
        tracker.getRemainingBudget()
      )
    );

    screen.render();
  });

  // Keybindings
  screen.key(["escape", "q", "C-c"], () => {
    screen.destroy();
    process.exit(0);
  });

  screen.render();

  return { screen };
}

function formatSavings(spent: number, saved: number, txCount: number, remaining: number | null): string {
  const wouldHaveSpent = spent + saved;
  const pct = wouldHaveSpent > 0 ? ((saved / wouldHaveSpent) * 100).toFixed(0) : "0";

  const lines = [
    "",
    `  {bold}{green-fg}SAVED: $${saved.toFixed(4)}{/green-fg}{/bold}`,
    "",
    `  {yellow-fg}Savings rate: ${pct}%{/yellow-fg}`,
    "",
    `  Spent:        {white-fg}$${spent.toFixed(4)}{/white-fg}`,
    `  Would've been:{white-fg}$${wouldHaveSpent.toFixed(4)}{/white-fg}`,
    "",
    `  Transactions: {cyan-fg}${txCount}{/cyan-fg}`,
  ];

  if (remaining != null) {
    lines.push(`  Budget left:  {white-fg}$${remaining.toFixed(2)}{/white-fg}`);
  }

  return lines.join("\n");
}

function updateBarChart(barChart: any, store: ServiceStore) {
  // Show web_search providers as default comparison
  const searchProviders = store.getProviders("web_search");
  if (searchProviders.length > 0) {
    const titles: string[] = [];
    const data: number[] = [];
    for (const p of searchProviders.slice(0, 8)) {
      titles.push(p.serviceName.slice(0, 10));
      // Display in millicents for readability
      data.push(p.priceUsd != null ? p.priceUsd * 1000 : 0);
    }
    barChart.setData({ titles, data });
  }
}

function updateServiceTable(table: any, store: ServiceStore) {
  const headers = ["Intent", "Provider", "$/req"];
  const rows: string[][] = [];

  for (const intent of store.getAllIntents()) {
    const providers = store.getProviders(intent);
    for (const p of providers.slice(0, 2)) {
      rows.push([
        intent,
        p.serviceName.slice(0, 13),
        p.priceUsd != null ? p.priceUsd.toFixed(4) : "vary",
      ]);
    }
  }

  table.setData({ headers, data: rows.slice(0, 30) });
}
