# Phase 255: Top-menu Run Servers button — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Add a "Run Servers" button to `TopNav` that calls a BFF endpoint which spawns `./run-bank.sh restart`, streams stdout/stderr via SSE, and renders output in a modal (status cards + live log). User can verify all services started cleanly without opening a terminal.

**In scope:**
- "Run Servers" button in `TopNav` (right side, any logged-in user)
- BFF route `POST /api/dev/run-servers` — spawns `./run-bank.sh restart`, streams SSE output
- In-progress singleton guard (409 if already running)
- Rate limiting on the BFF endpoint
- Production guard (refuse if `NODE_ENV=production` or `VERCEL=1`)
- Frontend `RunServersModal` component — status cards + scrollable raw log panel
- Auto-dismiss on success; stay open on error

**Out of scope:**
- Parsing structured service health from output (just raw lines + basic card heuristics)
- Stop/status sub-commands via this button
- Any changes to `run-bank.sh` itself

</domain>

<decisions>
## Implementation Decisions

### D-01: Button placement and visibility
- The "Run Servers" button appears in the **right side of `TopNav`**, visible to **any logged-in user** (`user` truthy)
- No environment guard on the UI side (no hostname check)
- Sits alongside the UserMenu; consistent with existing right-side controls

### D-02: BFF execution model
- Endpoint always spawns **`./run-bank.sh restart`** — kill-then-start, predictable outcome every click
- **Singleton guard:** if a spawn is already in progress, return **HTTP 409** immediately
- Modal displays "Already starting, please wait" on 409

### D-03: Modal output and UX
- **Display:** Two sections — status cards at top (parsed from key output lines), scrollable raw terminal log below (monospace). Mirrors the `setupWizard` log-panel pattern
- **On stream end (success):** auto-dismiss after 3 seconds
- **On stream end (error / non-zero exit):** stay open, show error state with a Close button
- User can close the modal manually at any time (X button), which does NOT kill the background process

### D-04: Security boundary
- **Auth:** `requireSession` middleware — any authenticated session may call the endpoint (matches button visibility)
- **Rate limit:** 3 requests per minute per session (separate from the 409 singleton guard)
- **Production guard:** endpoint returns **HTTP 403** if `NODE_ENV === 'production'` or `process.env.VERCEL === '1'`

### Claude's Discretion
- Status card parsing heuristic: scan each output line for known port strings (`:3001`, `:4000`, `:8080`, `:8888`) or emoji/keyword patterns already in `run-bank.sh` output (e.g. "✅", "started", "listening"). Keep parsing simple — no brittle regex required.
- SSE event shape: follow `setupWizard.js` convention (`data: JSON\n\n`) with fields `{ line, type }` where `type` is `"stdout"` | `"stderr"` | `"done"` | `"error"`
- Modal styling: reuse `.dsm-*` CSS class patterns from `DemoServerCheckModal.css` where applicable; create new `RunServersModal.css` for specifics

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing SSE pattern (follow this)
- `banking_api_server/routes/setupWizard.js` — SSE headers, `res.write`, `onStep` callback pattern to replicate

### Existing modal pattern (reference for UX)
- `banking_api_ui/src/components/DemoServerCheckModal.js` — modal structure, CSS class conventions
- `banking_api_ui/src/components/DemoServerCheckModal.css` — `.dsm-*` classes to reuse/extend

### TopNav (file to modify)
- `banking_api_ui/src/components/TopNav.js` — add button in right-side section
- `banking_api_ui/src/components/TopNav.css` — add button styles

### Auth middleware
- `banking_api_server/middleware/auth.js` — use `requireSession` export

### Script to execute
- `run-bank.sh` — called as `./run-bank.sh restart` from repo root; do not modify the script

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `setupWizard.js` SSE pattern: `res.writeHead(200, { 'Content-Type': 'text/event-stream', ... })` + `res.write(...)` — copy verbatim
- `DemoServerCheckModal.js`: modal overlay + box structure, status icon pattern (🔴/✅)
- `requireSession` middleware: already exported from `auth.js`
- `express-rate-limit` already in `banking_api_server` dependencies (used in other routes)

### Established Patterns
- BFF routes live in `banking_api_server/routes/` and are registered in `server.js`
- SSE responses use `X-Accel-Buffering: no` header to prevent nginx buffering
- In-process state (singleton guard) can be a module-level `let activeProcess = null` variable in the route file

### Integration Points
- `TopNav.js` right side: add `<button>` after the view-switch button, before `<UserMenu>`
- New BFF route file: `banking_api_server/routes/devTools.js` (or similar) registered at `/api/dev`
- Frontend SSE consumer: `EventSource` or `fetch` with `ReadableStream` in `RunServersModal.js`

</code_context>

<specifics>
## Specific Ideas

- The 409 response should check a module-level singleton (not Redis) — this runs locally only
- `child_process.spawn('./run-bank.sh', ['restart'], { cwd: repoRoot, shell: true })` — pipe stdout and stderr both to SSE
- `repoRoot` resolved via `path.resolve(__dirname, '../../')` from within the routes file
- Close button on modal does NOT kill the background process (fire-and-forget from user perspective once started)

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 255-top-menu-run-servers-button-executes-run-bank-sh-via-bff-end*
*Context gathered: 2026-04-30*
