import type { Context } from "hono";
import type { PaymentTracker } from "../payments/tracker.js";
import type { PaymentMode } from "../proxy/server.js";

export function getDashboardHtml(paymentMode: PaymentMode = "free"): string {
  const isPaid = paymentMode === "paid";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MPP Router</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0b1120;
    color: #e2e8f0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-height: 100vh;
    padding: 16px;
  }

  .mono {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", "JetBrains Mono", monospace;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    margin-bottom: 16px;
    background: #131c2e;
    border: 1px solid rgba(56, 189, 248, 0.15);
    border-radius: 12px;
  }

  .logo {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-weight: 700;
    font-size: 1.1rem;
    color: #38bdf8;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: #94a3b8;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #f87171;
    transition: background 200ms ease;
  }

  .dot.live { background: #4ade80; }

  .mode-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 9999px;
    margin-left: 8px;
  }

  .mode-paid { background: rgba(250, 204, 21, 0.15); color: #facc15; }
  .mode-auth { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
  .mode-free { background: rgba(74, 222, 128, 0.15); color: #4ade80; }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  @media (min-width: 768px) {
    .grid {
      grid-template-columns: 1.4fr 1fr;
    }
  }

  .panel {
    background: #131c2e;
    border: 1px solid rgba(56, 189, 248, 0.15);
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    overflow: hidden;
  }

  .panel-label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #38bdf8;
    margin-bottom: 12px;
  }

  /* Live Feed */
  #feed {
    max-height: 340px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e293b #131c2e;
  }

  .tx-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 0;
    font-size: 0.78rem;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    flex-wrap: wrap;
  }

  .tx-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tx-dot.success { background: #4ade80; }
  .tx-dot.payment_error { background: #f87171; }
  .tx-dot.service_error { background: #facc15; }

  .tx-time {
    color: #64748b;
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.72rem;
    flex-shrink: 0;
  }

  .tx-intent {
    background: rgba(56, 189, 248, 0.12);
    color: #38bdf8;
    padding: 1px 7px;
    border-radius: 9999px;
    font-size: 0.68rem;
    font-weight: 500;
    flex-shrink: 0;
  }

  .tx-arrow { color: #475569; flex-shrink: 0; }

  .tx-provider {
    color: #e2e8f0;
    font-weight: 500;
    flex-shrink: 0;
  }

  .tx-amount {
    font-family: "SF Mono", "Fira Code", monospace;
    color: #94a3b8;
    font-size: 0.72rem;
    flex-shrink: 0;
  }

  .tx-saved {
    font-family: "SF Mono", "Fira Code", monospace;
    color: #4ade80;
    font-size: 0.72rem;
    flex-shrink: 0;
  }

  .tx-latency {
    font-family: "SF Mono", "Fira Code", monospace;
    color: #64748b;
    font-size: 0.72rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  .empty-state {
    color: #475569;
    font-size: 0.85rem;
    padding: 24px 0;
    text-align: center;
  }

  /* Savings / Revenue */
  .hero-saved {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 2.4rem;
    font-weight: 700;
    color: #4ade80;
    line-height: 1.1;
  }

  .hero-pct {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 1.2rem;
    color: #facc15;
    margin-top: 4px;
    margin-bottom: 16px;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .stat-box label {
    display: block;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #64748b;
    margin-bottom: 2px;
  }

  .stat-box .val {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 1rem;
    font-weight: 600;
    color: #e2e8f0;
    transition: opacity 200ms ease;
  }

  .stat-box .val.loss { color: #f87171; }

  /* Price Chart */
  .intent-select {
    background: #0b1120;
    color: #e2e8f0;
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 0.75rem;
    margin-left: 8px;
    outline: none;
  }

  .bar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .bar-name {
    width: 110px;
    font-size: 0.75rem;
    color: #94a3b8;
    text-align: right;
    flex-shrink: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar-track {
    flex: 1;
    height: 22px;
    background: rgba(255,255,255,0.04);
    border-radius: 4px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 300ms ease;
    min-width: 2px;
  }

  .bar-price {
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 0.72rem;
    color: #94a3b8;
    width: 70px;
    flex-shrink: 0;
  }

  /* Service Map */
  .svc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.78rem;
  }

  .svc-table th {
    text-align: left;
    color: #64748b;
    font-weight: 500;
    padding: 6px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .svc-table td {
    padding: 5px 8px;
  }

  .svc-table tr:nth-child(even) td {
    background: rgba(255,255,255,0.02);
  }

  .svc-price {
    font-family: "SF Mono", "Fira Code", monospace;
    color: #94a3b8;
  }

  #service-map-body {
    max-height: 280px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1e293b #131c2e;
  }
</style>
</head>
<body>
  <header>
    <span class="logo">&#9889; MPP ROUTER</span>
    <span class="status">
      <span class="dot" id="status-dot"></span>
      <span id="status-text">Connecting...</span>
      <span class="mode-badge mode-${paymentMode}">${paymentMode}</span>
    </span>
  </header>

  <div class="grid">
    <div class="panel">
      <div class="panel-label">Live Transactions</div>
      <div id="feed"><div class="empty-state">Waiting for requests...</div></div>
    </div>

    <div class="panel">
      <div class="panel-label">${isPaid ? "Revenue" : "Savings"}</div>
      <div class="hero-saved mono" id="hero-saved">$0.0000</div>
      <div class="hero-pct" id="hero-pct">${isPaid ? "0% margin" : "0% saved"}</div>
      <div class="stat-grid">
        ${isPaid ? `
        <div class="stat-box"><label>Gross Charged</label><div class="val" id="stat-charged">$0.0000</div></div>
        <div class="stat-box"><label>Upstream Cost</label><div class="val" id="stat-spent">$0.0000</div></div>
        <div class="stat-box"><label>Requests</label><div class="val" id="stat-count">0</div></div>
        <div class="stat-box"><label>Loss (failed)</label><div class="val loss" id="stat-loss">$0.0000</div></div>
        ` : `
        <div class="stat-box"><label>Spent</label><div class="val" id="stat-spent">$0.0000</div></div>
        <div class="stat-box"><label>Would've been</label><div class="val" id="stat-would">$0.0000</div></div>
        <div class="stat-box"><label>Requests</label><div class="val" id="stat-count">0</div></div>
        <div class="stat-box"><label>Budget left</label><div class="val" id="stat-budget">No limit</div></div>
        `}
      </div>
    </div>

    <div class="panel">
      <div class="panel-label">Price Comparison <select class="intent-select" id="intent-select"></select></div>
      <div id="price-chart"></div>
    </div>

    <div class="panel">
      <div class="panel-label">Service Map</div>
      <div id="service-map-body">
        <table class="svc-table">
          <thead><tr><th>Intent</th><th>Provider</th><th>$/req</th></tr></thead>
          <tbody id="svc-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

<script>
(function() {
  var PAID_MODE = ${isPaid};
  var priceData = [];
  var MAX_FEED = 50;

  function fmt(n) {
    if (n == null) return '—';
    return '$' + n.toFixed(4);
  }

  function fmtPct(n, label) {
    return n.toFixed(1) + '% ' + label;
  }

  function timeStr(ts) {
    var d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function makeTxRow(tx) {
    var row = document.createElement('div');
    row.className = 'tx-row';
    var saved = (tx.savedVsNext != null && tx.savedVsNext > 0) ? '<span class="tx-saved">(saved ' + fmt(tx.savedVsNext) + ')</span>' : '';
    row.innerHTML =
      '<span class="tx-dot ' + tx.status + '"></span>' +
      '<span class="tx-time">' + timeStr(tx.timestamp) + '</span>' +
      '<span class="tx-intent">' + tx.intent + '</span>' +
      '<span class="tx-arrow">&rarr;</span>' +
      '<span class="tx-provider">' + tx.provider + '</span>' +
      '<span class="tx-amount">' + fmt(tx.amount) + '</span>' +
      saved +
      '<span class="tx-latency">' + tx.latencyMs + 'ms</span>';
    return row;
  }

  function renderFeed(transactions) {
    var feed = document.getElementById('feed');
    feed.innerHTML = '';
    if (!transactions || transactions.length === 0) {
      feed.innerHTML = '<div class="empty-state">Waiting for requests...</div>';
      return;
    }
    var reversed = transactions.slice().reverse();
    reversed.forEach(function(tx) {
      feed.appendChild(makeTxRow(tx));
    });
  }

  function updateStats(s) {
    var flash = function(el) {
      if (!el) return;
      el.style.opacity = '0.4';
      setTimeout(function() { el.style.opacity = '1'; }, 50);
    };
    var el;

    if (PAID_MODE) {
      // Revenue mode
      el = document.getElementById('hero-saved');
      el.textContent = fmt(s.totalRevenue);
      flash(el);
      document.getElementById('hero-pct').textContent = fmtPct(s.marginPercent, 'margin');
      el = document.getElementById('stat-charged');
      if (el) { el.textContent = fmt(s.totalCharged); flash(el); }
      el = document.getElementById('stat-spent');
      if (el) { el.textContent = fmt(s.totalSpent); flash(el); }
      el = document.getElementById('stat-count');
      if (el) { el.textContent = s.transactionCount; flash(el); }
      el = document.getElementById('stat-loss');
      if (el) { el.textContent = fmt(s.totalLoss); flash(el); }
    } else {
      // Savings mode
      el = document.getElementById('hero-saved');
      el.textContent = fmt(s.totalSaved);
      flash(el);
      document.getElementById('hero-pct').textContent = fmtPct(s.savingsPercent, 'saved');
      el = document.getElementById('stat-spent');
      if (el) { el.textContent = fmt(s.totalSpent); flash(el); }
      el = document.getElementById('stat-would');
      if (el) { el.textContent = fmt(s.totalSpent + s.totalSaved); flash(el); }
      el = document.getElementById('stat-count');
      if (el) { el.textContent = s.transactionCount; flash(el); }
      el = document.getElementById('stat-budget');
      if (el) { el.textContent = s.remainingBudget != null ? fmt(s.remainingBudget) : 'No limit'; flash(el); }
    }
  }

  function renderPriceChart(intent) {
    var entry = priceData.find(function(p) { return p.intent === intent; });
    var chart = document.getElementById('price-chart');
    if (!entry || !entry.providers.length) {
      chart.innerHTML = '<div class="empty-state">No providers</div>';
      return;
    }
    var providers = entry.providers.filter(function(p) { return p.priceUsd != null; });
    if (!providers.length) {
      chart.innerHTML = '<div class="empty-state">All dynamic pricing</div>';
      return;
    }
    providers.sort(function(a, b) { return a.priceUsd - b.priceUsd; });
    var maxPrice = providers[providers.length - 1].priceUsd;
    var html = '';
    providers.forEach(function(p, i) {
      var pct = maxPrice > 0 ? (p.priceUsd / maxPrice) * 100 : 0;
      var hue = providers.length === 1 ? 142 : 142 - (i / (providers.length - 1)) * 100;
      html += '<div class="bar-row">' +
        '<span class="bar-name">' + p.service + '</span>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(pct, 3) + '%;background:hsl(' + hue + ',60%,55%)"></div></div>' +
        '<span class="bar-price">' + fmt(p.priceUsd) + '</span></div>';
    });
    chart.innerHTML = html;
  }

  function renderServiceMap() {
    var tbody = document.getElementById('svc-tbody');
    var html = '';
    priceData.forEach(function(entry) {
      var top2 = entry.providers.slice(0, 2);
      top2.forEach(function(p) {
        html += '<tr><td>' + entry.intent + '</td><td>' + p.service + '</td>' +
          '<td class="svc-price">' + (p.priceUsd != null ? fmt(p.priceUsd) : 'dynamic') + '</td></tr>';
      });
    });
    tbody.innerHTML = html;
  }

  function populateIntentSelect() {
    var sel = document.getElementById('intent-select');
    sel.innerHTML = '';
    priceData.forEach(function(entry) {
      var opt = document.createElement('option');
      opt.value = entry.intent;
      opt.textContent = entry.intent;
      sel.appendChild(opt);
    });
    var ws = priceData.find(function(p) { return p.intent === 'web_search'; });
    if (ws) sel.value = 'web_search';
    sel.addEventListener('change', function() {
      renderPriceChart(sel.value);
    });
  }

  function addTxToFeed(tx) {
    var feed = document.getElementById('feed');
    var empty = feed.querySelector('.empty-state');
    if (empty) empty.remove();
    feed.insertBefore(makeTxRow(tx), feed.firstChild);
    while (feed.children.length > MAX_FEED) {
      feed.removeChild(feed.lastChild);
    }
  }

  // SSE
  function connectSSE() {
    var es = new EventSource('/events');
    es.addEventListener('open', function() {
      document.getElementById('status-dot').classList.add('live');
      document.getElementById('status-text').textContent = 'Live';
    });
    es.addEventListener('stats', function(e) {
      updateStats(JSON.parse(e.data));
    });
    es.addEventListener('transaction', function(e) {
      addTxToFeed(JSON.parse(e.data));
    });
    es.addEventListener('error', function() {
      document.getElementById('status-dot').classList.remove('live');
      document.getElementById('status-text').textContent = 'Reconnecting...';
    });
  }

  // Init
  Promise.all([
    fetch('/stats').then(function(r) { return r.json(); }),
    fetch('/prices').then(function(r) { return r.json(); })
  ]).then(function(results) {
    var stats = results[0];
    var prices = results[1];
    priceData = prices;

    updateStats(stats);
    renderFeed(stats.recentTransactions);
    populateIntentSelect();
    renderPriceChart(document.getElementById('intent-select').value || 'web_search');
    renderServiceMap();
    connectSSE();
  });
})();
</script>
</body>
</html>`;
}

export function createEventStream(c: Context, tracker: PaymentTracker): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      function sendStats() {
        send("stats", {
          totalSpent: tracker.getTotalSpent(),
          totalSaved: tracker.getTotalSaved(),
          savingsPercent: tracker.getSavingsPercent(),
          transactionCount: tracker.getTransactionCount(),
          remainingBudget: tracker.getRemainingBudget(),
          totalCharged: tracker.getTotalCharged(),
          totalRevenue: tracker.getTotalRevenue(),
          totalLoss: tracker.getTotalLoss(),
          marginPercent: tracker.getMarginPercent(),
        });
      }

      // Send current stats on connect
      sendStats();

      // Listen for transactions
      const onTransaction = (tx: any) => {
        // Strip private fields
        const { responsePreview, url, ...safe } = tx;
        send("transaction", safe);
        sendStats();
      };

      tracker.on("transaction", onTransaction);

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(":\n\n"));
        } catch {
          // stream closed
        }
      }, 30_000);

      // Cleanup on disconnect
      c.req.raw.signal.addEventListener("abort", () => {
        tracker.off("transaction", onTransaction);
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
