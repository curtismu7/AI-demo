# Technology Stack

**Analysis Date:** 2026-03-31

## Languages

**Primary:**
- JavaScript (ES2022) — `banking_api_server/` (Express BFF, plain CommonJS modules)
- TypeScript 5.x — `banking_mcp_server/src/` (strict mode, compiled to `dist/`)
- JavaScript (JSX) — `banking_api_ui/src/` (React, transpiled by CRA)
- Python 3.x — `langchain_agent/src/` (async, FastAPI-based agent)

## Runtime

**Environment:**
- Node.js 20.x — `banking_api_server/`, `banking_mcp_server/`, `banking_api_ui/`
- Python 3.x — `langchain_agent/` (no pinned version; `requirements.txt` drives deps)

**Package Manager:**
- npm >=9 — all JS/TS sub-projects (individual `package.json` per sub-project)
- pip — `langchain_agent/requirements.txt`
- Lockfile: `package-lock.json` present in each JS sub-project; no `poetry.lock` in agent

## Frameworks

**Backend (BFF):**
- Express 4.18 — `banking_api_server/server.js` — HTTP BFF, OAuth proxy, banking APIs

**Frontend:**
- React 18.2 — `banking_api_ui/src/` — SPA via Create React App (react-scripts 5.0.1)
- React Router DOM 6.28 — client-side routing

**MCP Server:**
- No web framework; custom WebSocket server via `ws` 8.14 + optional Streamable HTTP transport
- `@modelcontextprotocol/sdk` 0.5.0 — MCP protocol foundation

**Agent:**
- FastAPI >=0.100 — `langchain_agent/src/api/` — health + inspector HTTP endpoints
- Uvicorn >=0.20 — ASGI server
- WebSocket transport via `websockets` >=11.0 — agent ↔ UI chat stream

**Testing:**
- Jest 29.x — `banking_api_server/` + `banking_mcp_server/` (unit + integration)
- @playwright/test 1.44 — end-to-end tests in `banking_api_ui/tests/e2e/`
- @testing-library/react 13 — component unit tests in `banking_api_ui/src/`
- Supertest 7 — HTTP integration tests in `banking_api_server/`
- pytest >=7, pytest-asyncio, pytest-mock — `langchain_agent/tests/`

**Build / Dev:**
- react-scripts 5.0.1 (CRA) — UI build; outputs to `banking_api_ui/build/`
- tsc (TypeScript 5.x) — MCP server compile; outputs to `banking_mcp_server/dist/`
- nodemon 3 — dev hot-reload in BFF and MCP server
- ts-node 10.9 — MCP server dev execution without pre-compile

## Key Dependencies

**Critical (BFF — `banking_api_server/package.json`):**
- `express` ^4.18.2 — HTTP framework
- `express-session` ^1.19.0 — server-side session management
- `express-rate-limit` ^7.1.5 — API rate limiting
- `helmet` ^7.1.0 — HTTP security headers
- `jsonwebtoken` ^9.0.2 — JWT decode + verify for OAuth tokens
- `bcryptjs` ^2.4.3 — password hashing (demo users)
- `ws` ^8.19.0 — WebSocket client connecting BFF to MCP server

**Storage (BFF):**
- `better-sqlite3` ^12.8.0 — local config persistence (`data/config.db`); used when KV not set
- `redis` ^5.11 + `connect-redis` ^9.0 — TCP Redis session store (self-hosted / Railway)
- `@vercel/kv` ^3.0 — Upstash REST session store + config KV (Vercel deployments)

**MCP Server (`banking_mcp_server/package.json`):**
- `@modelcontextprotocol/sdk` ^0.5.0 — MCP protocol types and SDK
- `ws` ^8.14.0 — WebSocket server
- `jsonschema` ^1.4.1 — tool input parameter validation
- `uuid` ^9.0.0 — session/correlation IDs

**UI (`banking_api_ui/package.json`):**
- `axios` ^1.4.0 — HTTP client to BFF
- `chart.js` ^4.3.0 + `react-chartjs-2` ^5.2 — dashboard charts
- `react-table` ^7.8.0 — transaction table rendering
- `react-toastify` ^11.0.5 — toast notifications
- `date-fns` ^2.30 — date formatting

**Agent (`langchain_agent/requirements.txt`):**
- `langchain==0.0.353` — agent orchestration, tool binding
- `openai<1.0.0` — ChatOpenAI LLM provider (primary)
- `groq>=0.4.0` — Groq LLM provider (optional)
- `pydantic<2.0.0` — data validation (Pydantic v1 API)
- `cryptography>=41.0.0` — token encryption at rest
- `redis>=4.5.0` — optional token caching
- `sqlalchemy>=2.0.0` + `alembic>=1.10.0` — optional persistent storage

## TypeScript Configuration

**`banking_mcp_server/tsconfig.json`:**
- `target: ES2020`, `module: commonjs`
- `strict: true`, `esModuleInterop: true`, `skipLibCheck: true`
- `experimentalDecorators: true`, `emitDecoratorMetadata: true`
- `outDir: ./dist`, `rootDir: ./src`
- Source maps + declaration files emitted

## Configuration

**Environment:**
- `.env` files loaded via `dotenv` in all sub-projects at startup
- Root `.env.example` is the canonical catalog of all variables across all apps
- Per-sub-project `.env.example` files are narrower copies
- Vercel injects env vars at runtime (no `.env` file on Vercel)
- `banking_api_server/services/configStore.js` provides runtime config: env vars → KV/SQLite fallback chain

**Build:**
- `vercel.json` — Vercel deploy config: `buildCommand: "cd banking_api_ui && npm run build"`, `outputDirectory: "banking_api_ui/build"`, API routes → `/api/handler`
- `banking_api_ui/.env` — `REACT_APP_*` variables baked at build time (CRA convention)
- TypeScript build: `npm run build` in `banking_mcp_server/` runs `tsc`

## Platform Requirements

**Development:**
- Node.js 20.x, npm >=9
- Python 3.x with pip
- Optional: Docker + docker-compose (MCP server dev/prod containers)
- Optional: Redis instance for multi-instance session testing

**Production:**
- Vercel — UI + BFF (serverless functions via `api/handler.js`)
- Railway / Render / Fly.io — MCP server (Docker; NOT deployed on Vercel)
- Replit — alternative full-stack hosting (BFF + UI)
- Upstash Redis — session store and config KV on Vercel (required for multi-instance)

---

*Stack analysis: 2026-03-31*
