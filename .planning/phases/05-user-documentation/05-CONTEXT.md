---
phase: 05-user-documentation
created: 2026-04-01
status: locked
---

# Phase 05: user-documentation — Context

## Domain

Developer-facing documentation: a setup guide that takes a developer from zero to working local demo, and an architecture walkthrough that explains the 3-layer token flow at each step of each auth flow.

Target reader: A mid-level developer or architect who clones the repo and wants to run it locally AND understand what it demonstrates. Not Ping-specific knowledge assumed.

---

## Decisions

### D-01: Setup guide lives at `docs/SETUP.md`
Create `docs/SETUP.md` as the comprehensive setup guide. Update `README.md` to replace its current "Quick Start" and "Configuration" sections with a pointer to `docs/SETUP.md`.

Rationale: README is already 292 lines and is the project overview / agent instructions entry point. A full setup guide deserves its own file. Mirrors `docs/VERCEL_SETUP.md` which already exists for the Vercel path.

### D-02: Architecture walkthrough at `docs/ARCHITECTURE_WALKTHROUGH.md`
Create a new `docs/ARCHITECTURE_WALKTHROUGH.md` (narrative + diagrams). Do NOT modify existing `ARCHITECTURE.md` — it's a standards reference table that is still useful. The new file is the "how it works" story; the old file is the "what standards we use" reference.

### D-03: Sequence diagrams — new `.drawio` files in `docs/`
Create new draw.io XML files for the 3 auth flows:
- `docs/BX-Finance-AuthCode-PKCE-Flow.drawio` — Authorization Code + PKCE (login)
- `docs/BX-Finance-CIBA-Flow.drawio` — CIBA backchannel auth (agent-triggered OOB approval)
- `docs/BX-Finance-TokenExchange-Flow.drawio` — RFC 8693 token exchange (1-exchange and 2-exchange, UI→BFF→MCP)

Do NOT modify existing drawio files (`BX-Finance-2-Exchange-Delegated-Chain.drawio`, etc.) — they show the sub-step token details and are used in the `docs/` directory.

All diagrams must be in draw.io XML format (`.drawio`) — never Mermaid or Lucidchart.

### D-04: Setup guide depth — comprehensive step-by-step
`docs/SETUP.md` must be comprehensive enough that following it from scratch produces a working local demo (all 3 auth flows operational). Required sections:

1. **Prerequisites** — Node.js version, npm, what a PingOne environment is
2. **PingOne app configuration** — step-by-step: create the OAuth application, what grant types, redirect URIs (exact values), allowed scopes, worker app setup, environment ID
3. **Environment variables** — table of all env vars with: name, where to get the value, example value, required/optional
4. **Local run** — exact commands to start all 3 services
5. **Verify the setup** — "you should see X at Y URL" checklist for each of the 3 auth flows
6. **Vercel deployment** — pointer to `docs/VERCEL_SETUP.md` (don't duplicate)
7. **Troubleshooting** — top 5 failure modes with diagnostic + fix

Success criterion: A developer with a fresh PingOne trial + fresh clone can follow the guide step-by-step to get a running demo WITHOUT referring to any other file first.

### D-05: Architecture walkthrough depth — annotated narrative + per-flow token state
`docs/ARCHITECTURE_WALKTHROUGH.md` must explain:

1. **Component map** — what each of the 3 services does and why (UI, BFF, MCP server)
2. **Why BFF holds tokens** — the security model: browser gets cookie, not token
3. **Per-flow walkthrough** — for each of the 3 auth flows:
   - What the user does
   - What each hop exchanges
   - What token exists where at each step (table: "After step N, token X is held by Y")
4. **RFC markers** — each diagram and table section annotated with which RFC governs that step
5. **The diagrams** — the 3 `.drawio` files created in D-03 are embedded/referenced

---

## Deferred Ideas

- Interactive OpenAPI docs / Swagger UI (separate phase, not doc files)
- Video walkthrough / screencasts (out of scope)
- Automated doc generation from code comments (out of scope for v1.0)

---

## Canonical Refs

- `README.md` — Current setup quick-start (to be replaced with pointer)
- `ARCHITECTURE.md` — Existing standards reference (to be preserved, not replaced)
- `docs/VERCEL_SETUP.md` — Vercel deployment guide (reference only, link from SETUP.md)
- `docs/SETUP_AUTOMATION_PLAN.md` — Internal setup automation plan (reference for what PingOne config steps are needed)
- `docs/PINGONE_APP_SCOPE_MATRIX.md` — PingOne scope reference (consult when writing env var table)
- `.env.example` or equivalent — Any existing env var list in the repo
- `banking_api_server/configStore.js` or `config.js` — Source of truth for what env vars the server reads
- `scripts/setup-vercel-env.js` — Reference for complete env var list

---

## Claude's Discretion

- Exact wording and tone of the docs (technical but approachable)
- Whether to include a "demo walkthrough" section in ARCHITECTURE_WALKTHROUGH.md (short version of the tour)
- Specific formatting (headers, callout boxes, code blocks)
- Whether docs/SETUP.md links to the in-app /onboarding page as a complement
