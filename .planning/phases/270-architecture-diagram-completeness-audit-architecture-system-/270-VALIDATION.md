---
phase: 270
slug: architecture-diagram-completeness-audit-architecture-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
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
| 270-01-01 | TBD | TBD | REQ-DIAGRAM-* | TBD | mermaid source completeness | unit | `cd banking_api_ui && CI=true npm test -- --watchAll=false --testPathPattern='ArchitectureDiagram.completeness'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `banking_api_ui/src/components/__tests__/ArchitectureDiagram.completeness.test.js` — sync test (Plan B in research recommendations)
- [ ] PNG regen confirmation: `scripts/build-diagrams.sh` succeeds with mermaid-cli@11 (Plan C)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diagram visually conveys the system topology to a new viewer | Coverage | Visual judgment, not assertable | Open `/architecture/system`, walk a teammate through it; can they identify all 8 services + key edges in under 60s without explanation? |
| Mermaid source renders correctly in GitHub markdown preview | Source quality | GitHub renderer behaves slightly differently than mermaid-cli | Open the .mmd file in GitHub web UI; confirm it renders without errors |
| No secret values appear in any diagram label | Token custody | Eyeball the rendered PNG + the source | Grep mermaid sources for known secret prefixes (e.g. `key_helix_`, `secret_`); visually scan PNG output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 3s (single test); < 120s (full suite + build)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
