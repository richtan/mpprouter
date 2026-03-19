/**
 * Demo script: fires a sequence of requests through the Switchboard proxy
 * to demonstrate intent routing, auto-payment, and savings tracking.
 *
 * Usage: npx tsx scripts/demo.ts
 */

const PROXY = "http://localhost:3402";

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

  const res = await fetch(url, { method: "POST" });
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (k.startsWith("x-switchboard")) headers[k] = v;
  });

  return {
    status: res.status,
    headers,
    bodyPreview: (await res.text()).slice(0, 200),
  };
}

async function main() {
  console.log("\n⚡ Switchboard Demo — Intelligent MPP Router\n");
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
      const provider = result.headers["x-switchboard-provider"] || "unknown";
      const price = result.headers["x-switchboard-price"] || "?";
      const saved = result.headers["x-switchboard-saved"] || "N/A";
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
