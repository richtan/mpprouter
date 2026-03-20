# MPP Router

Cost-optimized API router that selects the cheapest provider for each request intent, handles [MPP](https://www.anthropic.com/research/mpp) micropayments automatically, and tracks savings in real time. Supports a **payment facilitator model** where agents pay the router, and the router pays upstream — keeping a configurable margin.

**Live dashboard:** [mpprouter.com](https://mpprouter.com)

## How it works

1. You send a request with an **intent** (e.g. `web_search`, `llm`, `image_gen`)
2. The router picks the **cheapest available provider** for that intent
3. **Paid mode**: The router issues a 402 challenge — your MPP client pays the router, and the router pays upstream (keeping a margin)
4. You get the response back with routing metadata in headers

```
Agent --[pays $0.012 via MPP]--> mpprouter --[pays $0.01 via MPP]--> upstream provider
                                 (keeps $0.002 margin)
```

## Supported intents

`web_search` · `scrape` · `llm` · `image_gen` · `travel` · `email` · `social` · `enrich` · `maps` · `blockchain` · `weather` · `finance`

## Quickstart

```bash
# Clone and install
git clone git@github.com:richtan/mpprouter.git
cd mpprouter
npm install

# Configure
export SPENDING_KEY=0x...         # MPP signing key for upstream payments (required)
export RECEIVING_ADDRESS=0x...    # Wallet address to receive caller payments (required for paid mode)
export MPP_SECRET_KEY=my-secret   # HMAC secret for 402 challenge verification (required for paid mode)
export PAYMENT_MODE=paid          # paid / auth / free (default: paid)
export BUDGET=5                   # Max USD to spend upstream (default: $5)

# Run with terminal dashboard
npm run dev

# Or headless
npm start
```

The server starts on port **3402** (override with `PORT` env var).

## API

### Payment modes

| Mode | Description |
|------|-------------|
| `paid` (default) | Callers pay the router via MPP 402 protocol. Router pays upstream and keeps a margin. |
| `auth` | Bearer token auth (`API_KEY`). Router pays upstream from its own wallet. |
| `free` | No auth, no payment. Router pays upstream from its own wallet. |

In `paid` mode, spending endpoints return a 402 challenge — MPP clients handle this automatically. In `auth` mode, `Authorization: Bearer <API_KEY>` is required.

### Intent routing

```bash
# Search the web
curl -X POST "http://localhost:3402/intent/web_search?q=hello" \
  -H "Authorization: Bearer $API_KEY"

# Generate an image
curl -X POST "http://localhost:3402/intent/image_gen" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a cat in space"}'
```

Response headers include routing metadata:
- `X-MppRouter-Intent` — matched intent
- `X-MppRouter-Provider` — selected provider
- `X-MppRouter-Price` — cost in USD
- `X-MppRouter-Saved` — savings vs next cheapest

### MCP server

mpprouter exposes all intents as MCP tools at `/mcp`. Any MCP-compatible client (Claude, etc.) can call intents directly — payment flows through `_meta` instead of HTTP headers.

```bash
# Initialize (stateless — per-request)
curl -X POST http://localhost:3402/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

# List available tools
curl -X POST http://localhost:3402/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-03-26" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call web_search tool
curl -X POST http://localhost:3402/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-protocol-version: 2025-03-26" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"web_search","arguments":{"query":"hello"}}}'
```

In `paid` mode, tool calls return a `-32042` MCP error with a payment challenge. MCP clients with MPP support handle this automatically. In `auth` mode, include `Authorization: Bearer <API_KEY>` on the HTTP request.

### Other endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | No | Web dashboard |
| GET | `/events` | No | SSE stream (live transactions + stats) |
| GET | `/health` | No | Service/intent counts |
| GET | `/prices` | No | All intents with provider pricing |
| GET | `/compare/:intent` | No | Compare providers for an intent |
| GET | `/stats` | No | Spending totals and recent transactions |
| ALL | `/proxy/*` | Yes | Direct proxy to a specific service |
| ALL | `/mcp` | Yes* | MCP server endpoint (tools = intents) |

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SPENDING_KEY` | Yes | — | Hex private key for upstream MPP payment signing |
| `RECEIVING_ADDRESS` | Yes (paid mode) | — | Wallet address to receive caller payments |
| `MPP_SECRET_KEY` | Yes (paid mode) | — | HMAC secret for stateless 402 challenge verification |
| `PAYMENT_MODE` | No | `paid` | `paid` / `auth` / `free` |
| `API_KEY` | No | — | Bearer token for auth mode; also gates `/events` SSE |
| `BUDGET` | No | `5` | Max USD to spend upstream per session |
| `PORT` | No | `3402` | HTTP server port |
| `MARKUP_PERCENT` | No | `20` | % markup on upstream cost |
| `MARKUP_MIN` | No | `0.002` | Minimum markup per request (USD) — covers gas |
| `MARKUP_DEFAULT` | No | `0.05` | Default charge when upstream price unknown |

## Deploy

Deployed on [Railway](https://railway.app) via Docker:

```bash
railway up --detach
```

Or use the Dockerfile directly:

```bash
docker build -t mpprouter .
docker run -p 3402:3402 \
  -e SPENDING_KEY=0x... \
  -e API_KEY=my-secret \
  mpprouter
```

## Architecture

```
Request → Provider selection (cheapest) → Payment gate (402 challenge/verify)
  → MPP payment to upstream (402 protocol) → Proxy to provider → Response + receipt
```

- **Hono** web framework on Node.js
- **mppx** for cryptographic micropayments
- Services loaded from `src/discovery/services.json`
- Provider failures tracked with 60s cooldown
- Transaction log kept in memory (last 1000)
