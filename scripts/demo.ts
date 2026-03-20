/**
 * Demo script: fires a sequence of requests through the MPP Router proxy
 * to demonstrate intent routing, auto-payment, and savings tracking.
 *
 * Usage: npx tsx scripts/demo.ts
 * Env: PROXY_URL (default http://localhost:3402), API_KEY (optional auth token)
 */

const PROXY = process.env.PROXY_URL || "http://localhost:3402";
const API_KEY = process.env.API_KEY;

interface DemoRequest {
  label: string;
  intent: string;
  params: Record<string, string>;
}

const REQUESTS: DemoRequest[] = [
  { label: "Searching for 'AI research papers 2026'", intent: "web_search", params: { q: "AI research papers 2026" } },
  { label: "Searching for 'best restaurants in SF'", intent: "web_search", params: { q: "best restaurants in SF" } },
  { label: "Searching for 'TypeScript 6.0 features'", intent: "web_search", params: { q: "TypeScript 6.0 features" } },
  { label: "Searching for 'MPP protocol crypto payments'", intent: "web_search", params: { q: "MPP protocol crypto payments" } },
  { label: "Searching for 'hackathon winning strategies'", intent: "web_search", params: { q: "hackathon winning strategies" } },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fireRequest(req: DemoRequest) {
  const qs = new URLSearchParams(req.params).toString();
  const url = `${PROXY}/intent/${req.intent}?${qs}`;

  const headers: Record<string, string> = {};
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  const res = await fetch(url, { method: "POST", headers });
  const routerHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (k.startsWith("x-mpprouter")) routerHeaders[k] = v;
  });

  return {
    status: res.status,
    headers: routerHeaders,
    bodyPreview: (await res.text()).slice(0, 200),
  };
}

async function main() {
  console.log("\n⚡ MPP Router Demo\n");
  console.log(`Target: ${PROXY}`);
  console.log("Firing requests through the proxy...\n");

  // Check proxy is up
  try {
    const health = await fetch(`${PROXY}/health`);
    const data = await health.json();
    console.log(`Proxy is up: ${data.services} services, ${data.intents} intents\n`);
  } catch {
    console.error("❌ Proxy not running! Start with: npx tsx src/index.ts --no-tui");
    process.exit(1);
  }

  let totalRequests = 0;

  for (const req of REQUESTS) {
    console.log(`🔍 ${req.label}`);
    try {
      const result = await fireRequest(req);
      const provider = result.headers["x-mpprouter-provider"] || "unknown";
      const price = result.headers["x-mpprouter-price"] || "?";
      const saved = result.headers["x-mpprouter-saved"] || "N/A";
      console.log(`   → ${provider} | ${price} | Saved: ${saved} | ${result.status}\n`);
      totalRequests++;
    } catch (err: any) {
      console.log(`   ❌ Failed: ${err.message}\n`);
    }
    await sleep(1500);
  }

  // Get final stats
  try {
    const stats = await (await fetch(`${PROXY}/stats`)).json();
    console.log("━".repeat(50));
    console.log(`\n📊 Final Tally:`);
    console.log(`   Requests:  ${stats.transactionCount}`);
    console.log(`   Spent:     $${stats.totalSpent.toFixed(4)}`);
    console.log(`   Saved:     $${stats.totalSaved.toFixed(4)}`);
    console.log(`   Rate:      ${stats.savingsPercent.toFixed(0)}% savings`);
    console.log(`\n🎯 Same results, ${stats.savingsPercent.toFixed(0)}% cheaper. The agent never knew.\n`);
  } catch {}
}

main();
