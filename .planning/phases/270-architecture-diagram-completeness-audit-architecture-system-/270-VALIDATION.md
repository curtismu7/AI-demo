---
phase: 270
slug: architecture-diagram-completeness-audit-architecture-system
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-14
updated: 2026-05-14
---

# Phase 270 — Validation Strategy

> Per-phase validation contract. Diagrams are text+image artifacts; the validation is a single sync test plus visual spot-check.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest 29.x (banking_api_ui CRA defaults) |
| **Config file** | banking_api_ui CRA jest defaults |
| **Quick run command** | `cd banking_api_ui && CI=true npm test -- --watchAll=false --testPathPattern='ArchitectureDiagram.completeness'` |
| **Full suite command** | `cd banking_api_ui && CI=true npm test -- --watchAll=false` + `cd banking_api_ui && npm run build` |
| **Estimated runtime** | ~3s (single test); ~120s full suite + UI build |

---

## Sampling Rate

- **After every task commit:** Run the single ArchitectureDiagram.completeness test
- **After every plan wave:** Run that + `cd banking_api_ui && npm run build` (UI build gate per CLAUDE.md)
- **Before `/gsd-verify-work`:** Full UI test suite + build, plus regenerate PNGs via `scripts/build-diagrams.sh` to confirm mermaid sources parse
- **Max feedback latency:** 3 seconds (single test); 120 seconds (full UI suite + build)

---

## Per-Task Verification Map

> Populated by gsd-planner.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 270-01-01 | 01 | 1 | REQ-DIAGRAM-01, REQ-DIAGRAM-02, REQ-DIAGRAM-04, REQ-DIAGRAM-07 | T-270-01, T-270-02 | mermaid source coverage + no secret values | grep | `grep -c "banking_mcp_invest\|banking_mortgage_service\|banking_agent_service\|langchain_agent\|secrets.vault\|PingOne Management API" architecture-simple.mmd` | ✅ exists | ✅ green |
| 270-01-02 | 01 | 1 | REQ-DIAGRAM-06, REQ-DIAGRAM-08, REQ-DIAGRAM-11 | T-270-02, T-270-05 | emoji + port + K8s-planned | grep | `grep -c "🖥️\|☁️\|:3000" architecture.mmd \| grep -E "^0$"` AND `grep -c "Kubernetes cluster (planned" architecture.mmd \| grep -E "^[1-9]"` | ✅ exists | ✅ green |
| 270-01-03 | 01 | 1 | REQ-DIAGRAM-01..15 | T-270-04 | duplicate removed + REQ-IDs registered | file-test + grep | `test ! -f "i4ai-ref-arch (1).mmd" && grep -c "REQ-DIAGRAM-" .planning/REQUIREMENTS.md \| grep -E "^15$"` | ✅ exists | ✅ green |
| 270-02-01 | 02 | 1 | REQ-DIAGRAM-09, REQ-DIAGRAM-10, REQ-DIAGRAM-15 | T-270-01, T-270-03 | sync test enforces drift detection | jest | `cd banking_api_ui && CI=true npx react-scripts test --watchAll=false --testPathPattern='ArchitectureDiagram.completeness'` | ✅ exists | ✅ green |
| 270-03-01 | 03 | 2 | REQ-DIAGRAM-13 | T-270-06 | mermaid-cli pin @11 | grep + shellcheck | `grep -c "@mermaid-js/mermaid-cli@11" scripts/build-diagrams.sh \| grep -E "^1$" && bash -n scripts/build-diagrams.sh` | ✅ exists | ✅ green |
| 270-03-02 | 03 | 2 | REQ-DIAGRAM-13 | T-270-02 | PNGs regenerated, mtime fresh | shell script + file-test | `bash scripts/build-diagrams.sh && for p in overview overview2 token-flow token-flow2; do [[ -s "banking_api_ui/public/architecture/${p}.png" ]] \|\| exit 1; done` | ✅ exists | ✅ green |
| 270-03-03 | 03 | 2 | (UI build gate) | T-270-02b | CRA build still passes | npm script | `cd banking_api_ui && CI=true npm run build` | ✅ exists | ✅ green |
| 270-04-01 | 04 | 3 | REQ-DIAGRAM-12 | T-270-03 | REGRESSION_PLAN §1 row + §4 entry | grep | `grep -c "Architecture diagram completeness" REGRESSION_PLAN.md \| grep -E "^[2-9]"` AND `grep -c "### 2026-05-14 — Phase 270" REGRESSION_PLAN.md \| grep -E "^1$"` | ✅ exists | ✅ green |
| 270-04-02 | 04 | 3 | REQ-DIAGRAM-14 | T-270-05 | InteractiveArchDiagram annotated + build green | grep + npm | `grep -c "Phase 270\|architecture-simple.mmd" banking_api_ui/src/components/education/InteractiveArchDiagram.js \| grep -E "^[2-9]" && cd banking_api_ui && CI=true npm run build` | ✅ exists | ✅ green |
| 270-04-03 | 04 | 3 | (validation paperwork) | n/a | per-task map filled in | this file | `grep -c "^| 270-" .planning/phases/270-*/270-VALIDATION.md \| grep -E "^[9-9]\|^[1-9][0-9]"` | ✅ exists | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js` — sync test (Plan 02)
- [x] PNG regen confirmation: `scripts/build-diagrams.sh` succeeds with mermaid-cli@11 (Plan 03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagram visually conveys the system topology to a new viewer | Coverage | Visual judgment, not assertable | Open `/architecture/system`, walk a teammate through it; can they identify all 8 services + key edges in under 60s without explanation? |
| Mermaid source renders correctly in GitHub markdown preview | Source quality | GitHub renderer behaves slightly differently than mermaid-cli | Open the .mmd file in GitHub web UI; confirm it renders without errors |
| No secret values appear in any diagram label | Token custody | Eyeball the rendered PNG + the source | Grep mermaid sources for known secret prefixes (e.g. `key_helix_`, `secret_`); visually scan PNG output |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 3s (single test); < 120s (full suite + build)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** signed off — planner — Plan 04 — 2026-05-14
