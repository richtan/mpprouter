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
<title>mpprouter</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #06080d;
    --surface: #0c1018;
    --surface-raised: #111722;
    --border: rgba(255,255,255,0.06);
    --border-accent: rgba(99,220,190,0.2);
    --text: #d1d5db;
    --text-muted: #6b7280;
    --text-faint: #374151;
    --accent: #63dcbe;
    --accent-dim: rgba(99,220,190,0.12);
    --gold: #f5b731;
    --gold-dim: rgba(245,183,49,0.12);
    --red: #ef5350;
    --red-dim: rgba(239,83,80,0.12);
    --blue: #5b9cf6;
    --blue-dim: rgba(91,156,246,0.12);
    --mono: 'IBM Plex Mono', 'SF Mono', monospace;
    --sans: 'Instrument Sans', -apple-system, sans-serif;
    --radius: 8px;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Subtle dot grid background */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px);
    background-size: 24px 24px;
    pointer-events: none;
    z-index: 0;
  }

  .shell {
    position: relative;
    z-index: 1;
    max-width: 1280px;
    margin: 0 auto;
    padding: 20px;
  }

  /* ── Header ── */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 20px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-mark {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: linear-gradient(135deg, var(--accent), #3ba692);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #06080d;
    font-family: var(--mono);
  }

  .logo-text {
    font-family: var(--mono);
    font-weight: 600;
    font-size: 0.95rem;
    color: #f3f4f6;
    letter-spacing: -0.02em;
  }

  .logo-text span {
    color: var(--text-muted);
    font-weight: 400;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--red);
    transition: background 300ms ease;
  }

  .live-dot.connected {
    background: var(--accent);
    box-shadow: 0 0 8px rgba(99,220,190,0.4);
    animation: pulse-dot 2s ease-in-out infinite;
  }

  @keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .mode-tag {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 3px 10px;
    border-radius: 4px;
  }

  .mode-paid { background: var(--gold-dim); color: var(--gold); }
  .mode-auth { background: var(--blue-dim); color: var(--blue); }
  .mode-free { background: var(--accent-dim); color: var(--accent); }

  /* ── Stats Row ── */
  .stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 1px;
    background: var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 24px;
  }

  .stat-cell {
    background: var(--surface);
    padding: 20px 24px;
    animation: fadeUp 0.5s ease both;
  }

  .stat-cell:nth-child(2) { animation-delay: 0.05s; }
  .stat-cell:nth-child(3) { animation-delay: 0.1s; }
  .stat-cell:nth-child(4) { animation-delay: 0.15s; }
  .stat-cell:nth-child(5) { animation-delay: 0.2s; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .stat-label {
    font-size: 0.68rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .stat-value {
    font-family: var(--mono);
    font-size: 1.5rem;
    font-weight: 700;
    color: #f3f4f6;
    letter-spacing: -0.03em;
    transition: color 150ms ease;
  }

  .stat-value.accent { color: var(--accent); }
  .stat-value.gold { color: var(--gold); }
  .stat-value.red { color: var(--red); }

  .stat-sub {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-top: 4px;
  }

  /* ── Main Grid ── */
  .main-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
  }

  @media (min-width: 860px) {
    .main-grid {
      grid-template-columns: 1.6fr 1fr;
    }
  }

  /* ── Panel ── */
  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    animation: fadeUp 0.5s ease both;
    animation-delay: 0.25s;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    font-family: var(--mono);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }

  .panel-body {
    padding: 0;
  }

  /* ── Live Feed ── */
  #feed {
    max-height: 420px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1f2937 transparent;
  }

  .tx {
    display: grid;
    grid-template-columns: 6px 56px 1fr auto auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border);
    font-size: 0.78rem;
    transition: background 150ms ease;
    animation: txSlide 0.3s ease both;
  }

  @keyframes txSlide {
    from { opacity: 0; transform: translateX(-12px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .tx:hover {
    background: rgba(255,255,255,0.02);
  }

  .tx-pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tx-pip.success { background: var(--accent); box-shadow: 0 0 6px rgba(99,220,190,0.3); }
  .tx-pip.payment_error { background: var(--red); }
  .tx-pip.service_error { background: var(--gold); }

  .tx-time {
    font-family: var(--mono);
    font-size: 0.7rem;
    color: var(--text-faint);
  }

  .tx-route {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .tx-intent-tag {
    font-family: var(--mono);
    font-size: 0.65rem;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 3px;
    background: var(--accent-dim);
    color: var(--accent);
    white-space: nowrap;
  }

  .tx-arrow {
    color: var(--text-faint);
    font-size: 0.65rem;
  }

  .tx-provider {
    color: var(--text);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tx-cost {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: right;
    white-space: nowrap;
  }

  .tx-saved {
    font-family: var(--mono);
    font-size: 0.68rem;
    color: var(--accent);
    white-space: nowrap;
  }

  .tx-ms {
    font-family: var(--mono);
    font-size: 0.68rem;
    color: var(--text-faint);
    text-align: right;
    white-space: nowrap;
    min-width: 48px;
  }

  .empty-state {
    padding: 48px 20px;
    text-align: center;
    color: var(--text-faint);
    font-size: 0.82rem;
  }

  .empty-state .empty-icon {
    font-size: 1.4rem;
    margin-bottom: 8px;
    opacity: 0.4;
  }

  /* ── Right Column ── */
  .right-col {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* ── Sparkline ── */
  .sparkline-wrap {
    padding: 16px 20px;
  }

  .sparkline-row {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 48px;
  }

  .spark-bar {
    flex: 1;
    background: var(--accent);
    border-radius: 2px 2px 0 0;
    opacity: 0.35;
    transition: height 300ms ease, opacity 300ms ease;
    min-height: 2px;
  }

  .spark-bar.active {
    opacity: 1;
  }

  .spark-label {
    display: flex;
    justify-content: space-between;
    margin-top: 6px;
    font-family: var(--mono);
    font-size: 0.6rem;
    color: var(--text-faint);
  }

  /* ── Price Comparison ── */
  .intent-picker {
    font-family: var(--mono);
    font-size: 0.68rem;
    background: var(--surface-raised);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 8px;
    outline: none;
    cursor: pointer;
  }

  .intent-picker:focus {
    border-color: var(--accent);
  }

  .price-list {
    padding: 8px 0;
  }

  .price-row {
    display: grid;
    grid-template-columns: 100px 1fr 64px;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
  }

  .price-name {
    font-size: 0.75rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .price-track {
    height: 20px;
    background: rgba(255,255,255,0.03);
    border-radius: 3px;
    overflow: hidden;
    position: relative;
  }

  .price-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 400ms cubic-bezier(0.16,1,0.3,1);
    min-width: 3px;
    position: relative;
  }

  .price-fill.cheapest {
    background: linear-gradient(90deg, var(--accent), rgba(99,220,190,0.5));
  }

  .price-fill.mid {
    background: linear-gradient(90deg, var(--gold), rgba(245,183,49,0.4));
  }

  .price-fill.expensive {
    background: linear-gradient(90deg, var(--red), rgba(239,83,80,0.4));
  }

  .price-badge {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-family: var(--mono);
    font-size: 0.58rem;
    font-weight: 600;
    color: #06080d;
    letter-spacing: 0.02em;
  }

  .price-val {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: right;
  }

  /* ── Service Map ── */
  .svc-grid {
    padding: 4px 0;
    max-height: 300px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #1f2937 transparent;
  }

  .svc-row {
    display: grid;
    grid-template-columns: 1fr 1fr 70px;
    gap: 8px;
    padding: 7px 20px;
    font-size: 0.75rem;
    border-bottom: 1px solid var(--border);
  }

  .svc-row.svc-head {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    position: sticky;
    top: 0;
    background: var(--surface);
    z-index: 1;
  }

  .svc-intent {
    color: var(--text-muted);
  }

  .svc-provider {
    color: var(--text);
  }

  .svc-price {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--text-muted);
    text-align: right;
  }

  /* ── Install Bar ── */
  .install-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 20px;
    border-top: 1px solid var(--border);
  }

  .install-label {
    font-family: var(--sans);
    font-size: 0.68rem;
    color: var(--text-faint);
  }

  .install-cmd {
    font-family: var(--mono);
    font-size: 0.72rem;
    color: var(--accent);
    background: rgba(99,220,190,0.06);
    border: 1px solid rgba(99,220,190,0.15);
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    transition: background 150ms ease;
    user-select: all;
  }

  .install-cmd:hover {
    background: rgba(99,220,190,0.12);
  }

  .install-cmd.copied {
    color: var(--gold);
    border-color: rgba(245,183,49,0.3);
    background: rgba(245,183,49,0.06);
  }

  .arch-arrow {
    color: var(--text-faint);
  }

  /* ── Responsive ── */
  @media (max-width: 859px) {
    .tx {
      grid-template-columns: 6px 48px 1fr auto auto;
      gap: 8px;
      padding: 8px 16px;
    }
    .tx-saved { display: none; }
    .stat-value { font-size: 1.2rem; }
    .stat-cell { padding: 14px 18px; }
  }

  @media (max-width: 480px) {
    .stats-row { grid-template-columns: 1fr 1fr; }
    .tx-ms { display: none; }
  }
</style>
</head>
<body>
<div class="shell">

  <header>
    <div class="logo">
      <div class="logo-mark">R</div>
      <div class="logo-text">mpprouter <span>v1</span></div>
    </div>
    <div class="header-right">
      <div class="live-indicator">
        <span class="live-dot" id="live-dot"></span>
        <span id="live-text">connecting</span>
      </div>
      <span class="mode-tag mode-${paymentMode}">${paymentMode}</span>
    </div>
  </header>

  <!-- Stats Row -->
  <div class="stats-row">
    <div class="stat-cell">
      <div class="stat-label">${isPaid ? 'Net Revenue' : 'Total Saved'}</div>
      <div class="stat-value accent" id="hero-val">$0.00</div>
      <div class="stat-sub" id="hero-sub">${isPaid ? '0.0% margin' : '0.0% cheaper'}</div>
    </div>
    ${isPaid ? `
    <div class="stat-cell">
      <div class="stat-label">Gross Charged</div>
      <div class="stat-value" id="stat-charged">$0.00</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Upstream Cost</div>
      <div class="stat-value" id="stat-spent">$0.00</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Requests</div>
      <div class="stat-value" id="stat-count">0</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Loss</div>
      <div class="stat-value red" id="stat-loss">$0.00</div>
    </div>
    ` : `
    <div class="stat-cell">
      <div class="stat-label">Total Spent</div>
      <div class="stat-value" id="stat-spent">$0.00</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Would Have Cost</div>
      <div class="stat-value" id="stat-would">$0.00</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Requests</div>
      <div class="stat-value" id="stat-count">0</div>
    </div>
    <div class="stat-cell">
      <div class="stat-label">Budget Left</div>
      <div class="stat-value" id="stat-budget">&infin;</div>
    </div>
    `}
  </div>

  <div class="main-grid">

    <!-- Live Feed -->
    <div class="panel" style="animation-delay:0.25s">
      <div class="panel-head">
        <span class="panel-title">Live Transactions</span>
        <span class="panel-title" id="tx-rate"></span>
      </div>
      <div class="panel-body">
        <div id="feed">
          <div class="empty-state">
            <div class="empty-icon">~</div>
            Waiting for requests...
          </div>
        </div>
      </div>
      <div class="install-bar">
        <span class="install-label">Add to Claude Code:</span>
        <span class="install-cmd" id="install-cmd" title="Click to copy">npx mpprouter</span>
      </div>
    </div>

    <div class="right-col">

      <!-- Activity Sparkline -->
      <div class="panel" style="animation-delay:0.3s">
        <div class="panel-head">
          <span class="panel-title">Activity</span>
          <span class="panel-title" id="spark-total"></span>
        </div>
        <div class="sparkline-wrap">
          <div class="sparkline-row" id="sparkline"></div>
          <div class="spark-label">
            <span id="spark-start"></span>
            <span>now</span>
          </div>
        </div>
      </div>

      <!-- Price Comparison -->
      <div class="panel" style="animation-delay:0.35s">
        <div class="panel-head">
          <span class="panel-title">Price Comparison</span>
          <select class="intent-picker" id="intent-select"></select>
        </div>
        <div class="panel-body">
          <div id="price-chart" class="price-list"></div>
        </div>
      </div>

      <!-- Service Map -->
      <div class="panel" style="animation-delay:0.4s">
        <div class="panel-head">
          <span class="panel-title">Service Map</span>
        </div>
        <div class="panel-body">
          <div class="svc-grid" id="svc-grid">
            <div class="svc-row svc-head">
              <span>Intent</span>
              <span>Provider</span>
              <span style="text-align:right">$/req</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>

</div>

<script>
(function() {
  var PAID = ${isPaid};
  var priceData = [];
  var MAX_FEED = 60;

  // Sparkline: 30 buckets, 1-minute each
  var SPARK_BUCKETS = 30;
  var sparkCounts = new Array(SPARK_BUCKETS).fill(0);
  var sparkStart = Date.now();

  function fmt(n) {
    if (n == null) return '\\u2014';
    return '$' + n.toFixed(4);
  }

  function fmtShort(n) {
    if (n == null) return '\\u2014';
    if (n >= 1) return '$' + n.toFixed(2);
    return '$' + n.toFixed(4);
  }

  function timeStr(ts) {
    return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function makeTx(tx) {
    var el = document.createElement('div');
    el.className = 'tx';
    var saved = (tx.savedVsNext != null && tx.savedVsNext > 0)
      ? '<span class="tx-saved">' + fmt(tx.savedVsNext) + '</span>'
      : '<span class="tx-saved"></span>';
    el.innerHTML =
      '<span class="tx-pip ' + tx.status + '"></span>' +
      '<span class="tx-time">' + timeStr(tx.timestamp) + '</span>' +
      '<span class="tx-route">' +
        '<span class="tx-intent-tag">' + tx.intent + '</span>' +
        '<span class="tx-arrow">&#8594;</span>' +
        '<span class="tx-provider">' + tx.provider + '</span>' +
      '</span>' +
      '<span class="tx-cost">' + fmt(tx.amount) + '</span>' +
      saved +
      '<span class="tx-ms">' + tx.latencyMs + 'ms</span>';
    return el;
  }

  function renderFeed(txs) {
    var f = document.getElementById('feed');
    f.innerHTML = '';
    if (!txs || !txs.length) {
      f.innerHTML = '<div class="empty-state"><div class="empty-icon">~</div>Waiting for requests...</div>';
      return;
    }
    txs.slice().reverse().forEach(function(tx) { f.appendChild(makeTx(tx)); });
  }

  function addTx(tx) {
    var f = document.getElementById('feed');
    var empty = f.querySelector('.empty-state');
    if (empty) empty.remove();
    f.insertBefore(makeTx(tx), f.firstChild);
    while (f.children.length > MAX_FEED) f.removeChild(f.lastChild);

    // Update sparkline
    var bucket = Math.min(SPARK_BUCKETS - 1, Math.floor((Date.now() - sparkStart) / 60000));
    if (bucket >= 0 && bucket < SPARK_BUCKETS) sparkCounts[bucket]++;
    renderSparkline();
  }

  function updateStats(s) {
    if (PAID) {
      setText('hero-val', fmtShort(s.totalRevenue));
      setText('hero-sub', s.marginPercent.toFixed(1) + '% margin');
      setText('stat-charged', fmtShort(s.totalCharged));
      setText('stat-spent', fmtShort(s.totalSpent));
      setText('stat-count', s.transactionCount);
      setText('stat-loss', fmtShort(s.totalLoss));
    } else {
      setText('hero-val', fmtShort(s.totalSaved));
      setText('hero-sub', s.savingsPercent.toFixed(1) + '% cheaper');
      setText('stat-spent', fmtShort(s.totalSpent));
      setText('stat-would', fmtShort(s.totalSpent + s.totalSaved));
      setText('stat-count', s.transactionCount);
      var b = document.getElementById('stat-budget');
      if (b) b.textContent = s.remainingBudget != null ? fmtShort(s.remainingBudget) : '\\u221e';
    }
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // Sparkline
  function renderSparkline() {
    var wrap = document.getElementById('sparkline');
    var max = Math.max.apply(null, sparkCounts) || 1;
    var total = sparkCounts.reduce(function(a, b) { return a + b; }, 0);
    var html = '';
    for (var i = 0; i < SPARK_BUCKETS; i++) {
      var h = Math.max(2, (sparkCounts[i] / max) * 48);
      var active = sparkCounts[i] > 0 ? ' active' : '';
      html += '<div class="spark-bar' + active + '" style="height:' + h + 'px"></div>';
    }
    wrap.innerHTML = html;
    setText('spark-total', total + ' req');

    var startEl = document.getElementById('spark-start');
    if (startEl) startEl.textContent = SPARK_BUCKETS + 'm ago';
  }

  // Prices
  function renderPrices(intent) {
    var entry = priceData.find(function(p) { return p.intent === intent; });
    var chart = document.getElementById('price-chart');
    if (!entry || !entry.providers.length) {
      chart.innerHTML = '<div class="empty-state">No providers</div>';
      return;
    }
    var providers = entry.providers.filter(function(p) { return p.priceUsd != null; });
    if (!providers.length) {
      chart.innerHTML = '<div class="empty-state">Dynamic pricing only</div>';
      return;
    }
    providers.sort(function(a, b) { return a.priceUsd - b.priceUsd; });
    var maxP = providers[providers.length - 1].priceUsd;
    var html = '';
    providers.forEach(function(p, i) {
      var pct = maxP > 0 ? Math.max((p.priceUsd / maxP) * 100, 4) : 4;
      var tier = i === 0 ? 'cheapest' : (i < providers.length - 1 ? 'mid' : 'expensive');
      if (providers.length === 1) tier = 'cheapest';
      var badge = i === 0 ? '<span class="price-badge">BEST</span>' : '';
      html += '<div class="price-row">' +
        '<span class="price-name">' + p.service + '</span>' +
        '<div class="price-track"><div class="price-fill ' + tier + '" style="width:' + pct + '%">' + badge + '</div></div>' +
        '<span class="price-val">' + fmt(p.priceUsd) + '</span></div>';
    });
    chart.innerHTML = html;
  }

  function populateSelect() {
    var sel = document.getElementById('intent-select');
    sel.innerHTML = '';
    priceData.forEach(function(e) {
      var o = document.createElement('option');
      o.value = e.intent;
      o.textContent = e.intent;
      sel.appendChild(o);
    });
    var ws = priceData.find(function(p) { return p.intent === 'web_search'; });
    if (ws) sel.value = 'web_search';
    sel.addEventListener('change', function() { renderPrices(sel.value); });
  }

  function renderServiceMap() {
    var grid = document.getElementById('svc-grid');
    var html = '<div class="svc-row svc-head"><span>Intent</span><span>Provider</span><span style="text-align:right">$/req</span></div>';
    priceData.forEach(function(e) {
      e.providers.slice(0, 2).forEach(function(p) {
        html += '<div class="svc-row">' +
          '<span class="svc-intent">' + e.intent + '</span>' +
          '<span class="svc-provider">' + p.service + '</span>' +
          '<span class="svc-price">' + (p.priceUsd != null ? fmt(p.priceUsd) : 'dynamic') + '</span></div>';
      });
    });
    grid.innerHTML = html;
  }

  // SSE
  function connectSSE() {
    var es = new EventSource('/events');
    es.addEventListener('open', function() {
      document.getElementById('live-dot').classList.add('connected');
      document.getElementById('live-text').textContent = 'live';
    });
    es.addEventListener('stats', function(e) { updateStats(JSON.parse(e.data)); });
    es.addEventListener('transaction', function(e) { addTx(JSON.parse(e.data)); });
    es.addEventListener('error', function() {
      document.getElementById('live-dot').classList.remove('connected');
      document.getElementById('live-text').textContent = 'reconnecting';
    });
  }

  // Copy install command
  var installCmd = document.getElementById('install-cmd');
  if (installCmd) {
    installCmd.addEventListener('click', function() {
      navigator.clipboard.writeText('npx mpprouter').then(function() {
        installCmd.textContent = 'copied!';
        installCmd.classList.add('copied');
        setTimeout(function() {
          installCmd.textContent = 'npx mpprouter';
          installCmd.classList.remove('copied');
        }, 1500);
      });
    });
  }

  // Init
  renderSparkline();
  Promise.all([
    fetch('/stats').then(function(r) { return r.json(); }),
    fetch('/prices').then(function(r) { return r.json(); })
  ]).then(function(res) {
    var stats = res[0]; var prices = res[1];
    priceData = prices;
    updateStats(stats);
    renderFeed(stats.recentTransactions);
    populateSelect();
    renderPrices(document.getElementById('intent-select').value || 'web_search');
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
