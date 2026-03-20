# mpprouter

Cost-optimized API router that selects the cheapest provider per intent, handles MPP micropayments, and exposes all intents as MCP tools.

## Architecture

```
Claude Code --[stdio MCP]--> local npx mpprouter --[HTTP + MPP 402]--> mpprouter.com --[MPP 402]--> upstream provider
                              (signs locally)                          (Railway)
```

- **Local MCP client** (`src/mcp/client.ts`): stdio server that proxies tool calls to remote mpprouter, signing MPP 402 challenges locally. Private key never leaves the machine.
- **Remote server** (`src/index.ts`): Hono HTTP server on Railway with `/mcp`, `/intent/:intent`, `/proxy/*` routes. Selects cheapest provider, handles payment facilitation (charges caller, pays upstream, keeps margin).
- **Shared executor** (`src/routing/executor.ts`): Core intent execution logic used by both HTTP handler and MCP server.

## Key Files

| File | Purpose |
|------|---------|
| `src/mcp/client.ts` | Local stdio MCP client (what `npx mpprouter` runs) |
| `src/mcp/server.ts` | Remote MCP server (per-request stateless pattern) |
| `src/proxy/server.ts` | Hono routes, CORS, auth middleware |
| `src/proxy/handler.ts` | HTTP request handler for `/intent` and `/proxy` |
| `src/routing/executor.ts` | Shared intent execution (buildUrl, payRequest, track) |
| `src/routing/selector.ts` | Provider selection (cheapest, failure cooldown, pinning) |
| `src/routing/intents.ts` | Intent definitions and URL builders |
| `src/payments/payer.ts` | Upstream mppx client (signs with SPENDING_KEY) |
| `src/payments/receiver.ts` | Incoming mppx server (HTTP + MCP SDK transports) |
| `src/payments/pricing.ts` | Markup calculation (20% + min $0.002) |
| `src/payments/db.ts` | SQLite persistence (schema, insert, load, aggregates) |
| `src/payments/tracker.ts` | Transaction tracking, budget, revenue stats |
| `src/dashboard/web.ts` | Web dashboard HTML + SSE streaming |
| `bin/mpprouter.mjs` | npm bin shim (spawns tsx on client.ts) |

## Payment Flow

```
Caller pays $0.012 --> mpprouter pays $0.01 --> upstream provider
                       (keeps $0.002 margin)
```

- **USDC.e on Tempo** (`0x20c000000000000000000000b9537d11c60e8b50`)
- Three modes: `paid` (402 challenges), `auth` (Bearer token), `free` (no auth)
- Provider pinning: 402 challenge includes `providerId` in opaque, retry uses same provider

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SPENDING_KEY` | Yes | Hex private key for upstream MPP payments |
| `PAYMENT_MODE` | No (default: `paid`) | `paid`, `auth`, or `free` |
| `RECEIVING_ADDRESS` | Yes (paid mode) | Wallet address to receive caller payments |
| `MPP_SECRET_KEY` | Yes (paid mode) | HMAC secret for 402 challenge verification |
| `API_KEY` | No | Bearer token for auth mode |
| `BUDGET` | No (default: `5`) | Max USD spend limit |
| `DATA_DIR` | No (default: `/data`) | Directory for SQLite database file |

## Persistence

Transaction history is persisted to SQLite via `better-sqlite3` (synchronous, in-process). On startup, the tracker hydrates aggregates and recent transactions from the database. Falls back to in-memory if the db path is unavailable.

- **Database file**: `$DATA_DIR/mpprouter.db` (default `/data/mpprouter.db`)
- **WAL mode** enabled for concurrent read/write performance
- **Railway volume** mounted at `/data` provides persistence across deploys

## Deployment

- **Hosted on Railway** with auto-deploy from GitHub pushes to `main`
- **Domain**: mpprouter.com
- **Dockerfile**: `node:22-alpine`, `npm ci`, runs `tsx src/index.ts --no-tui`
- **Volume**: Railway volume mounted at `/data` for SQLite persistence

## npm Publishing

Published as `mpprouter` on npm. GitHub Actions auto-publishes on `mcp-v*` tags via OIDC.

To release a new version:
1. Bump `version` in `package.json`
2. Commit and push
3. `git tag mcp-v<version> && git push origin mcp-v<version>`

## Claude Code MCP Config

```json
"mpprouter": {
  "type": "stdio",
  "command": "npx",
  "args": ["mpprouter"],
  "env": {
    "SPENDING_KEY": "0x..."
  }
}
```

## Commands

```bash
npm run dev          # Local with TUI dashboard
npm run start        # Headless (production)
railway up --detach  # Manual deploy to Railway
```
