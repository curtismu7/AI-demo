# Stack — BX Finance Banking Demo

*Last updated: April 2026 (Phase 140)*

---

## Repository Structure

Monorepo with 3 deployable services:

```
Banking/
├── banking_api_server/    # Node.js BFF (Express) — deployed to Vercel
├── banking_api_ui/        # React SPA (CRA) — served by BFF in production
├── banking_mcp_server/    # MCP tool server (TypeScript/WS) — Railway/Render/Fly
└── langchain_agent/       # Python LangChain agent (separate, optional)
```

---

## Backend — `banking_api_server`

### Runtime
- **Node.js**: `20.x` (required)
- **npm**: `>=9`
- **Language**: JavaScript (CommonJS modules, `require()`)
- **Entry point**: `banking_api_server/server.js`

### Framework & Middleware
| Package | Version | Role |
|---------|---------|------|
| `express` | ^4.18.2 | HTTP server |
| `helmet` | ^7.1.0 | Security headers |
| `cors` | ^2.8.5 | CORS policy |
| `morgan` | ^1.10.0 | HTTP request logging |
| `express-rate-limit` | ^7.1.5 | Global + per-route rate limits |
| `express-session` | ^1.19.0 | Session management |
| `express-validator` | ^7.3.2 | Input validation |
| `zod` | ^4.3.6 | Schema validation in services |

### Session Stores (priority order)
1. **Upstash REST API** (`@vercel/kv` / `KV_REST_API_URL` + `KV_REST_API_TOKEN`) — Vercel production
2. **node-redis TCP** (`REDIS_URL` / `KV_URL`) — self-hosted Redis
3. **SQLite** (`better-sqlite3`) — local dev fallback
4. **In-memory** — last resort (lost on restart)

Store logic: `banking_api_server/server.js` (lines ~49–130), services: `upstashSessionStore.js`, `sqliteSessionStore.js`.

### Auth & Token Processing
| Package | Role |
|---------|------|
| `jsonwebtoken` | JWT decode/verify |
| `bcryptjs` | Password hashing (demo users) |
| `uuid` | Nonces, state params, jti |

### AI / Agent
| Package | Version | Role |
|---------|---------|------|
| `langchain` | ^1.3.1 | LLM orchestration |
| `@langchain/core` | ^1.1.39 | Base interfaces |
| `@langchain/groq` | ^1.2.0 | Groq LLM (default) |
| `@langchain/anthropic` | ^1.3.26 | Anthropic Claude |
| `@langchain/langgraph` | ^1.2.8 | LangGraph StateGraph agent |

`GROQ_API_KEY` is recommended; falls back to keyword-based NL parser. Primary agent service: `banking_api_server/services/bankingAgentLangChainService.js`.

### Data / Storage
| Package | Version | Role |
|---------|---------|------|
| `better-sqlite3` | ^12.8.0 | Local dev sessions + config (`configStore.js`) |
| `redis` | ^5.11.0 | Redis TCP client |
| `@vercel/kv` | ^3.0.0 | Upstash REST client |

### Networking
| Package | Version | Role |
|---------|---------|------|
| `axios` | ^1.6.0 | All PingOne API calls + internal |
| `ws` | ^8.19.0 | MCP streaming WebSocket (`mcpExchangeMode.js`) |

### Dev Tools
| Package | Version | Role |
|---------|---------|------|
| `jest` | ^29.7.0 | Unit/integration tests |
| `nodemon` | ^3.0.2 | Dev hot-reload |
| `supertest` | ^7.2.2 | HTTP integration tests |

### Required ENV Vars
| Var | Description |
|-----|-------------|
| `PINGONE_ENVIRONMENT_ID` | PingOne tenant UUID |
| `PINGONE_ADMIN_CLIENT_ID` | Admin OAuth app client ID |
| `PINGONE_ADMIN_CLIENT_SECRET` | Admin OAuth app client secret |
| `PINGONE_USER_CLIENT_ID` | User OAuth app client ID |
| `PINGONE_USER_CLIENT_SECRET` | User OAuth app client secret |
| `SESSION_SECRET` | Express session signing secret (min 32 chars) |
| `PUBLIC_APP_URL` | BFF public origin (drives OAuth redirect URIs) |

### Recommended ENV Vars
| Var | Description |
|-----|-------------|
| `GROQ_API_KEY` | Groq LLM key for NL banking agent |
| `KV_REST_API_URL` | Upstash Redis URL (Vercel session store) |
| `KV_REST_API_TOKEN` | Upstash Redis token |

### Key npm Scripts
```bash
npm start              # node server.js
npm run dev            # nodemon server.js
npm test               # jest --forceExit (all tests)
npm run test:unit      # Core business logic
npm run test:auth      # Auth/OAuth tests
npm run test:session   # Session store tests
npm run test:bff-tokens  # BFF session gating
```

---

## Frontend — `banking_api_ui`

### Runtime
- **Node.js**: 18+ (CRA requirement)
- **Language**: JavaScript (JSX) with a small number of `.tsx` files
- **Entry point**: `banking_api_ui/src/index.js`
- **Build tool**: `react-scripts` (CRA 5.x)
- **Build output**: `banking_api_ui/build/` — served as static by BFF in production

### Framework & Routing
| Package | Version | Role |
|---------|---------|------|
| `react` | ^18.2.0 | UI library |
| `react-dom` | ^18.2.0 | DOM rendering |
| `react-router-dom` | ^6.28.0 | SPA routing (BrowserRouter) |
| `react-scripts` | ^5.0.1 | CRA toolchain |

### UI Libraries
| Package | Role |
|---------|------|
| `react-icons` | ^5.6.0 | Icon set |
| `react-toastify` | ^11.0.5 | Toast notifications (via `src/utils/appToast.js`) |
| `chart.js` + `react-chartjs-2` | Charts/graphs |
| `react-table` | ^7.8.0 | Data tables |
| `date-fns` | ^2.30.0 | Date formatting |

### HTTP Client
- `axios` ^1.4.0 — via `banking_api_ui/src/services/apiClient.js` (singleton class, traffic store interceptors, spinner, `withCredentials: true`)

### Test Dependencies
| Package | Role |
|---------|------|
| `@testing-library/react` | Component tests |
| `@testing-library/jest-dom` | DOM assertions |
| `@playwright/test` | E2E browser tests (`banking_api_ui/tests/e2e/`) |

---

## MCP Server — `banking_mcp_server`

- **Language**: TypeScript → compiled to `dist/`
- **Protocol**: WebSocket + MCP SDK (`@modelcontextprotocol/sdk` ^0.5.0)
- **Session store**: Upstash Redis (`@upstash/redis` ^1.34.0)
- **Key dep**: `ws` ^8.14.0, `axios` ^1.6.0
- **Deployment**: Railway / Render / Fly.io (NOT Vercel — serverless incompatible with persistent WebSocket)

---

## Deployment

### Vercel (primary)
- `vercel.json` — rewrites all non-API paths to SPA, functions at `banking_api_server/api/handler.js`
- Session store: Upstash Redis required for multi-instance stateless operation
- `outputDirectory`: `banking_api_ui/build`

### Local Development
```bash
# BFF (port 3001 default, 3002 with run-bank.sh)
cd banking_api_server && npm run dev

# UI dev server (port 3000 default, 4000 with run-bank.sh)
cd banking_api_ui && npm start
# REACT_APP_API_PORT must match BFF port in banking_api_ui/.env
```

### Ports
| Mode | UI | BFF |
|------|-----|-----|
| Default | 3000 | 3001 |
| `run-bank.sh` | 4000 | 3002 |
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
