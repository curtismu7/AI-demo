---
phase: 270-architecture-diagram-completeness-audit-architecture-system
plan: 01
subsystem: docs
tags: [mermaid, architecture-diagrams, requirements, audit]

# Dependency graph
requires:
  - phase: 266-add-api-key-and-id-token-backend-variants-with-dedicated-res
    provides: banking_resource_server live + Path A/B/C three-credential dispositions (the structure the cleaned-up diagram now portrays correctly)
  - phase: 268-production-hosting-hardening-for-kubernetes-docker-deploymen
    provides: K8s topology (planned) — drawn as dashed subgraph in architecture.mmd
  - phase: 269-portable-encrypted-credential-vault
    provides: secrets.vault startup-load mechanism (drawn as startup-load arrow into BFF in both diagrams)
provides:
  - architecture-simple.mmd extended with banking_mcp_server, banking_mcp_invest, banking_mortgage_service, langchain_agent, secrets.vault, PingOne Management API nodes + 11 new edges
  - architecture.mmd cleaned (emoji-free, port-correct), banking_mcp_gateway/agent/invest/mortgage/hitl + Vault + Phase 268 K8s planned subgraph added, stray BankingRS block enclosed in proper ResourceServer subgraph
  - i4ai-ref-arch (1).mmd Finder duplicate removed from repo root
  - REQ-DIAGRAM-01..15 anchored in .planning/REQUIREMENTS.md (seeds the rest of the phase)
affects:
  - 270-02 (Plan 02 sync test depends on the SVC_LIST substrings now present in .mmd files)
  - 270-03 (Plan 03 PNG regen + UI build gate — depends on these .mmd sources being mermaid-syntax-valid)
  - 270-04 (Plan 04 REGRESSION_PLAN row + InteractiveArchDiagram top comment — references REQ-DIAGRAM-12 + REQ-DIAGRAM-14)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mermaid two-tier source pattern preserved: architecture-simple.mmd (clean view) + architecture.mmd (detailed view); both share most nodes; detailed adds middleware-stack + K8s subgraphs"
    - "Phase 270: dashed-border `planned` classDef + `k8s` classDef (stroke-dasharray: 6 4) to visually distinguish shipped-today from planned-future state"

key-files:
  created: []
  modified:
    - architecture-simple.mmd
    - architecture.mmd
    - .planning/REQUIREMENTS.md
  deleted:
    - "i4ai-ref-arch (1).mmd"

key-decisions:
  - "Extended both .mmd sources in place rather than creating a third 'full-system' diagram (per discuss-phase locked decision; aligns with single-source-of-truth principle and existing regen pipeline)"
  - "Used pre-existing 'planned' classDef pattern (dashed border, stroke-dasharray: 6 4) for Phase 268 K8s and Phase 269 vault to make the 'not live today' visual cue unmistakable"
  - "Renamed standalone SQLite node to BankingSQLite in architecture.mmd to avoid class-assignment collision after enclosing the stray BankingRS block in a proper ResourceServer subgraph"
  - "Anchored 15 REQ-DIAGRAM-* requirements before the rest of the phase executes, so Plans 02-04 can reference stable IDs"

patterns-established:
  - "Pattern 1: Diagram-as-text invariant — every run-bank.sh SVC_LIST entry must appear as a node-label substring in at least one .mmd source (enforced by upcoming Plan 02 Jest sync test)"
  - "Pattern 2: Mechanism-not-value labelling — vault arrow says 'startup-load' (mechanism), never 'VAULT_PASSWORD=...' (value). Plan 02 sync test enforces this as a regression"

requirements-completed:
  - REQ-DIAGRAM-01
  - REQ-DIAGRAM-02
  - REQ-DIAGRAM-03
  - REQ-DIAGRAM-04
  - REQ-DIAGRAM-05
  - REQ-DIAGRAM-06
  - REQ-DIAGRAM-07
  - REQ-DIAGRAM-08
  - REQ-DIAGRAM-11

# Metrics
duration: 6min
completed: 2026-05-14
---

# Phase 270 Plan 01: Architecture diagram source cleanup + REQ anchor seeding Summary

**Brought both mermaid sources in line with run-bank.sh SVC_LIST + Phase 269 vault startup-load + Phase 268 K8s planned topology; deleted Finder-duplicated i4ai-ref-arch (1).mmd; seeded REQ-DIAGRAM-01..15 so Plans 02-04 have stable IDs to anchor against.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-14T19:41:54Z
- **Completed:** 2026-05-14T19:48:00Z
- **Tasks:** 3
- **Files modified:** 3 modified + 1 deleted

## Accomplishments

- `architecture-simple.mmd` now names every SVC_LIST service (was missing banking_mcp_server, banking_mcp_invest, banking_mortgage_service, banking_agent_service / langchain_agent) plus the Phase 269 vault startup-load arrow and the PingOne Management API
- `architecture.mmd` cleaned of all §0-violating emojis (🖥️ AdminBrowser/CustomerBrowser, ☁️ PingOneCloud/PingOneAuthorize, 🔍 ConfigPage), fixed `:3000` → `:4000` port labels, replaced OpenAI-only LLM label with Helix-default fallback chain, completed the stray BankingRS block by enclosing it in a new ResourceServer subgraph
- Added Phase 268 K8s planned subgraph (dashed) with Ingress + 7 service pods + Phase 269 vault node
- Removed duplicate `i4ai-ref-arch (1).mmd` (pre-flight grep confirmed zero references in `.sh`/`.js`/`.ts`/`.json`/`.tsx`/`.jsx` — only documentation in `.planning/` mentions it)
- Appended REQ-DIAGRAM-01..15 to `.planning/REQUIREMENTS.md` as the anchor IDs for the rest of the phase

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend architecture-simple.mmd** — `28f38c0d` (feat) — 27 insertions, 1 deletion in architecture-simple.mmd
2. **Task 2: Clean up architecture.mmd** — `8be775f2` (feat) — 65 insertions, 13 deletions in architecture.mmd
3. **Task 3: Delete duplicate + REQ-DIAGRAM seeding** — `08ce183c` (chore) — REQUIREMENTS.md +20 lines, `i4ai-ref-arch (1).mmd` deleted (83 lines removed)

## Files Created/Modified

### Modified
- `architecture-simple.mmd` — Added 6 nodes (MCPServer, MCPInvest, Mortgage, LangChain, Vault, MgmtAPI), updated LLM label (Helix-default chain), added 11 new edges, applied classes to new nodes
- `architecture.mmd` — Removed 5 emojis (🖥️×2, ☁️×2, 🔍×1), fixed 3 `:3000`→`:4000` port labels, replaced OpenAI node with LLM (Helix-default chain), wrapped stray BankingRS in new ResourceServer subgraph (renamed standalone SQLite→BankingSQLite to avoid class collision), added Gateway subgraph (GwProxy + GwAuthorize) + AgentService/MCPInvestSvc/MortgageSvc/HITLSvc/Vault nodes, added Phase 268 K8s planned subgraph with 7 pods, added classDef k8s + classDef planned (both stroke-dasharray: 6 4), added Phase 270 edges for all new nodes, added class assignments for all new nodes
- `.planning/REQUIREMENTS.md` — Appended "Architecture Diagram Completeness (Phase 270)" section with REQ-DIAGRAM-01..15 entries (15 new requirement rows; no existing requirements modified)

### Deleted
- `i4ai-ref-arch (1).mmd` (3984 bytes, Finder duplicate; not in `scripts/build-diagrams.sh` ENTRIES allow-list; only referenced in documentation under `.planning/phases/`)

## Pre-deletion grep audit (T-270-04 mitigation)

Pre-flight `grep -rn "i4ai-ref-arch (1)" . --include="*.sh" --include="*.js" --include="*.ts" --include="*.json" --include="*.tsx" --include="*.jsx" --include="*.css" --include="*.html"`:
- Code/script references: **0**
- Documentation references (acceptable):
  - `.planning/phases/266-add-api-key-and-id-token-backend-variants-with-dedicated-res/266-05-PLAN.md` (historical note)
  - `.planning/phases/270-architecture-diagram-completeness-audit-architecture-system-/270-RESEARCH.md` (audit reference)
  - `.planning/phases/270-architecture-diagram-completeness-audit-architecture-system-/270-01-PLAN.md` (this plan's own audit note)
  - `.planning/phases/270-architecture-diagram-completeness-audit-architecture-system-/270-04-PLAN.md` (forward reference)

Deletion confirmed safe.

## REQ-DIAGRAM line ranges in REQUIREMENTS.md

The new section was appended at the end of `.planning/REQUIREMENTS.md` (after DELEG-07). Resulting structure (post-append):
- Line 134: `DELEG-07` (unchanged)
- Line 136: `---` (new section separator)
- Line 138: `## Architecture Diagram Completeness (Phase 270)` (new header)
- Lines 140-154: REQ-DIAGRAM-01 through REQ-DIAGRAM-15 (15 checkbox rows)

## Diagram-source change details

### `architecture-simple.mmd`
**Before:** 126 lines, 10 service nodes, missing banking_mcp_server / mcp_invest / mortgage / langchain_agent / vault / Management API as distinct nodes. LLM label said "(Helix · Anthropic · OpenAI)" without designating default.
**After:** 152 lines (+26), 16 service nodes, all SVC_LIST entries + langchain_agent + vault + Management API as labelled nodes. LLM label explicitly says "Helix (default) - x-api-key" plus optional providers.

Specific additions (with line range references within the new file):
- 6 nodes inserted after Authorize declaration (block: `%% ── Additional Node services (Phase 270 audit) ──`)
- LLM label updated in place (1 line replaced)
- 11 new edges in `%% ── Phase 270: edges for newly-named services ──` block
- 5 new class lines (MCPServer/MCPInvest=tool, Mortgage=backend, MgmtAPI=cloud, LangChain=external, Vault=planned)

### `architecture.mmd`
**Before:** 204 lines, 5 emojis (🖥️ ☁️ 🔍), 3 `:3000` port labels, OpenAI-only LLM node, stray BankingRS+SQLite block dangling outside any subgraph after line 165.
**After:** 257 lines (+53). 0 emojis (verified by Python emoji-range regex with §0 allowlist stripped). 0 `:3000` occurrences. LLM node replaced with Helix-default fallback chain. BankingRS+BankingSQLite cleanly wrapped in `ResourceServer` subgraph. Phase 268 K8s planned subgraph inserted at top (before AdminBrowser). Gateway subgraph + 5 individual service nodes + Vault node added after Agent subgraph. 13 new edges in `%% ── Phase 270: edges for newly-named services ──` block. 2 new classDefs (k8s, planned) + 3 new class lines.

## Decisions Made

- **Used AuthRoutes as the "BFF anchor" for new edges in architecture.mmd** rather than introducing a new "BFF" top-level node. The architecture.mmd file's design decomposes the BFF into route nodes (AuthRoutes, CibaRoutes, TxRoutes, etc.) inside the `API` subgraph; AuthRoutes is the most prominent entry-point route and serves as the natural anchor without adding a duplicate "BFF" node.
- **Did not regenerate any PNG.** Per plan instructions, Plan 03 owns the regen pipeline + UI build gate. The .mmd source edits are the deliverable for this plan.
- **Preserved the pre-existing `(CIBA-style)` annotation on the HITL edge** in architecture-simple.mmd. The locked user decision was that CIBA should not be *added* as a new prominent element in the simple view; the existing annotation on an existing edge isn't an addition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed stray 🔍 emoji from ConfigPage label in architecture.mmd**
- **Found during:** Task 2 (verification scan)
- **Issue:** The plan only explicitly listed 🖥️ and ☁️ for removal, but the plan's plan-level success criteria say "No emojis outside §0 allowlist in either .mmd file". A 🔍 emoji on the ConfigPage label (`tabs: OAuth · Verticals · 🔍 Token Validation`) violates REGRESSION_PLAN §0.
- **Fix:** Removed the 🔍 from the label; now reads `tabs: OAuth · Verticals · Token Validation`.
- **Files modified:** architecture.mmd (line 31)
- **Verification:** Python emoji-range regex against `[\U0001F300-\U0001FAFF\U00002600-\U000027BF]` after stripping §0 allowlist returns `NONE`.
- **Committed in:** 8be775f2 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical — §0 emoji invariant)
**Impact on plan:** Aligns the file with REGRESSION_PLAN §0 and the plan's own plan-level success criteria. No scope creep.

## Issues Encountered

- Pre-commit hook warns about CHANGELOG.md not being staged. The hook is advisory (not blocking — commits succeed); no CHANGELOG.md update was in scope for this plan (doc-only diagram edits). All 3 commits landed cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for Plan 02** — Plan 02's Jest sync test (`ArchitectureDiagram.completeness.test.js`) will now have stable substrings to assert against:
  - Every SVC_LIST entry appears in at least one .mmd source (verified by this plan's final grep)
  - OAuth grant markers (PingOne, RFC 8693, PKCE, client_credentials) appear in at least one .mmd source (verified)
  - No secret-value substrings (VAULT_PASSWORD=, client_secret=, _SECRET=, api_key= with value) (verified)
- **Ready for Plan 03** — PNG regen via `scripts/build-diagrams.sh` will pick up the updated .mmd sources; mermaid syntax is structurally balanced (14 subgraph / 14 end pairs).
- **Ready for Plan 04** — REQ-DIAGRAM-12 (REGRESSION_PLAN §1 row) and REQ-DIAGRAM-14 (InteractiveArchDiagram top comment) reference stable IDs in REQUIREMENTS.md.

## Self-Check

Files claimed created/modified:
- architecture-simple.mmd — FOUND
- architecture.mmd — FOUND
- .planning/REQUIREMENTS.md — FOUND
- i4ai-ref-arch (1).mmd — DELETED (confirmed not present)

Commits claimed:
- 28f38c0d — FOUND (Task 1: extend architecture-simple.mmd)
- 8be775f2 — FOUND (Task 2: clean up architecture.mmd)
- 08ce183c — FOUND (Task 3: delete duplicate + REQ seeding)

## Self-Check: PASSED

---
*Phase: 270-architecture-diagram-completeness-audit-architecture-system*
*Completed: 2026-05-14*
