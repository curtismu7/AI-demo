---
phase: 270-architecture-diagram-completeness-audit-architecture-system
plan: 03
subsystem: docs
tags: [mermaid, mermaid-cli, png-regen, architecture-diagrams, ui-build-gate]

# Dependency graph
requires:
  - phase: 270
    plan: 01
    provides: "Updated .mmd sources (architecture-simple.mmd + architecture.mmd extended with all SVC_LIST services, vault, Phase 268 K8s subgraph, emoji-free, port-correct) — the inputs the regen pipeline turns into the four PNG outputs"
provides:
  - "Four fresh PNGs in banking_api_ui/public/architecture/ (overview.png, overview2.png, token-flow.png, token-flow2.png) — all mtimes newer than corresponding .mmd source mtimes; DiagramRegeneratePanel admin UI will no longer show 'stale' badges"
  - "scripts/build-diagrams.sh now pins @mermaid-js/mermaid-cli@11 (current major); resolves to 11.15.0 as of regen time"
affects:
  - 270-04 (REGRESSION_PLAN row + InteractiveArchDiagram top comment plan — depends on the PNG assets being current so the §1 row's claim about diagram completeness is honest)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mermaid-cli @11 GA pinning pattern: one-character pin bump in scripts/build-diagrams.sh; backwards-compatible with existing flowchart / sequenceDiagram / classDef / subgraph syntax"
    - "Regen-then-commit-PNGs pattern: PNGs ship as static assets under banking_api_ui/public/architecture/ and are copied to build/architecture/ by CRA; they don't enter the JS bundle graph, so the UI build cannot regress from PNG content changes alone"

key-files:
  created: []
  modified:
    - scripts/build-diagrams.sh
    - banking_api_ui/public/architecture/overview.png
    - banking_api_ui/public/architecture/overview2.png
    - banking_api_ui/public/architecture/token-flow.png
    - banking_api_ui/public/architecture/token-flow2.png
  deleted: []

key-decisions:
  - "Bumped @mermaid-js/mermaid-cli pin from @10 to @11 (one-character change on line 49 of scripts/build-diagrams.sh) per research assumption A1 — mermaid 11.x is GA since Oct 2024 and backwards-compatible with our .mmd syntax; npx -y resolved to 11.15.0 at regen time and rendered all four PNGs cleanly"
  - "No source-file changes were needed for Task 3 (UI build gate is verification-only); build/ is gitignored, so Task 3 produced no commit"
  - "No mermaid syntax fixes were required during regen — Plan 01 used the canonical syntax pattern (14/14 balanced subgraph/end pairs); zero [fail] from build-diagrams.sh on the first try"

patterns-established:
  - "Pattern 1: When bumping the mermaid-cli major version, do it as a one-character edit and verify with bash -n + grep counts before running the pipeline. Run the pipeline immediately after the pin edit so the version is exercised by the very next commit."
  - "Pattern 2: After PNG regen, verify (a) file > 50 KB, (b) `file` reports PNG image data with reasonable width (script renders 2400-2800px), (c) mtime newer than .mmd source — all three asserted in the verify automated step."

requirements-completed:
  - REQ-DIAGRAM-13

# Metrics
duration: 4min
completed: 2026-05-14
---

# Phase 270 Plan 03: Architecture PNG regeneration + mermaid-cli @11 bump Summary

**Bumped mermaid-cli pin in scripts/build-diagrams.sh from @10 to @11 (one-character change on line 49; resolves to 11.15.0), then regenerated all four architecture PNGs from Plan 01's updated .mmd sources — overview.png (440K, 2384×1584), overview2.png (288K, 2784×1027), token-flow.png (534K, 2784×2892), token-flow2.png (185K, 1567×926). All PNG mtimes are now newer than their corresponding .mmd source mtimes, so the DiagramRegeneratePanel admin UI will no longer show "stale" badges. CRA build from banking_api_ui/ exits 0 with the new PNGs in place, satisfying CLAUDE.md non-negotiable #3.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-14T22:55:00Z
- **Completed:** 2026-05-14T22:59:00Z
- **Tasks:** 3 (1 source-file edit + 1 regen run + 1 verification-only)
- **Files modified:** 1 script + 4 PNG assets
- **Commits:** 2 (Task 3 was verification-only, no commit)

## Accomplishments

- `scripts/build-diagrams.sh` line 49 pin bumped `@mermaid-js/mermaid-cli@10` → `@mermaid-js/mermaid-cli@11` (one-character diff confirmed via `git diff`)
- `bash -n scripts/build-diagrams.sh` exits 0 (script parses cleanly after the bump)
- `bash scripts/build-diagrams.sh` ran end-to-end on the first try with `[ok]` for all four entries; zero `[fail]` lines, zero mermaid syntax errors
- All four PNGs regenerated to non-zero, valid PNG image data at the script's intended widths (2384-2784px)
- All four PNG mtimes (2026-05-14 15:58:xx) are newer than their corresponding .mmd source mtimes (2026-05-11 02:32-15:45)
- `cd banking_api_ui && npm run build` exits **0** (Compiled with warnings — pre-existing CRA bundle-size advisory only; no new errors, no new warnings)
- All four PNGs visible in `banking_api_ui/build/architecture/` after CRA build (copied from `public/` as expected)
- Plan 02's `ArchitectureDiagram.completeness` regression test still passes: **26/26 tests in 0.66s** (the .mmd source content the test asserts against did not change in this plan — Plan 01 owned that)

## Task Commits

Each task was committed atomically; Task 3 was verification-only with no source changes.

1. **Task 1: Bump mermaid-cli pin @10 → @11** — `e17bf0b8` (chore) — 1 insertion, 1 deletion in `scripts/build-diagrams.sh` (one-character change `0` → `1`)
2. **Task 2: Regenerate all four PNGs** — `d633554f` (feat) — 4 binary files updated (`banking_api_ui/public/architecture/{overview,overview2,token-flow,token-flow2}.png`), all from running `bash scripts/build-diagrams.sh` post-bump
3. **Task 3: UI build gate** — verification-only; `npm run build` exit 0 confirmed; `build/` is gitignored, no commit needed

## Files Created/Modified

### Modified
- `scripts/build-diagrams.sh` (line 49) — `@mermaid-js/mermaid-cli@10` → `@mermaid-js/mermaid-cli@11`. Exactly one-character change; the rest of the file (ENTRIES array, OUT_DIR, BASEDIR, fallback message) is untouched.
- `banking_api_ui/public/architecture/overview.png` — 287552 B → 448713 B; was 2026-05-11 02:37:28, now 2026-05-14 15:58 (newer than `architecture-simple.mmd` source at 2026-05-14 15:42:29). Rendered from `architecture-simple.mmd` at 2400px → 2384×1584px PNG.
- `banking_api_ui/public/architecture/overview2.png` — 259057 B → 292696 B; was 2026-05-11 02:37:30, now 2026-05-14 15:58 (newer than `architecture.mmd` source at 2026-05-14 15:45:30). Rendered from `architecture.mmd` at 2800px → 2784×1027px PNG.
- `banking_api_ui/public/architecture/token-flow.png` — 536451 B → 534746 B; was 2026-05-11 02:37:32, now 2026-05-14 15:58 (newer than `i4ai-ref-arch.mmd` source at 2026-05-11 02:32:42). Rendered from `i4ai-ref-arch.mmd` at 2800px → 2784×2892px PNG.
- `banking_api_ui/public/architecture/token-flow2.png` — 184629 B → 185407 B; was 2026-05-11 02:37:34, now 2026-05-14 15:59 (newer than `mcp-security-gateway.mmd` source at 2026-05-11 02:33:07). Rendered from `mcp-security-gateway.mmd` at 2400px → 1567×926px PNG.

### Created
- None.

### Deleted
- None.

## Exact diff applied to scripts/build-diagrams.sh

```diff
diff --git a/scripts/build-diagrams.sh b/scripts/build-diagrams.sh
index 453c0ae9..2acd78d6 100755
--- a/scripts/build-diagrams.sh
+++ b/scripts/build-diagrams.sh
@@ -46,7 +46,7 @@ render_one() {
   fi

   echo "  [render] ${name}: ${src_rel} -> $(basename "${out}") (${width}px)"
-  if ! npx -y @mermaid-js/mermaid-cli@10 \
+  if ! npx -y @mermaid-js/mermaid-cli@11 \
         -i "${src}" -o "${out}" -w "${width}" -b transparent >/dev/null 2>&1; then
     echo "    [fail]  ${name}: mermaid-cli could not render." >&2
     echo "            Manual fallback: open https://mermaid.live, paste ${src_rel}," >&2
```

## mermaid-cli version actually downloaded by npx

```
$ npx -y @mermaid-js/mermaid-cli@11 --version
11.15.0
```

Matches the version verified in 270-RESEARCH.md (also 11.15.0 at research time). The pin `@11` resolved to the current latest 11.x patch release.

## File sizes of regenerated PNGs

```
$ ls -la banking_api_ui/public/architecture/*.png
-rw-r--r--@ 1 curtismuir  staff  448713 May 14 15:58 banking_api_ui/public/architecture/overview.png
-rw-r--r--@ 1 curtismuir  staff  292696 May 14 15:58 banking_api_ui/public/architecture/overview2.png
-rw-r--r--@ 1 curtismuir  staff  534746 May 14 15:58 banking_api_ui/public/architecture/token-flow.png
-rw-r--r--@ 1 curtismuir  staff  185407 May 14 15:59 banking_api_ui/public/architecture/token-flow2.png

$ file banking_api_ui/public/architecture/*.png
overview.png:    PNG image data, 2384 x 1584, 8-bit/color RGBA, non-interlaced
overview2.png:   PNG image data, 2784 x 1027, 8-bit/color RGBA, non-interlaced
token-flow.png:  PNG image data, 2784 x 2892, 8-bit/color RGBA, non-interlaced
token-flow2.png: PNG image data, 1567 x 926, 8-bit/color RGBA, non-interlaced
```

All four are non-zero, well above the 50 KB acceptance threshold, and report as PNG image data at widths matching the script's intent.

## npm run build exit code and bundle size

```
$ cd banking_api_ui && npm run build
...
File sizes after gzip:

  959.73 kB  build/static/js/main.1ba2c02c.js
  124.84 kB  build/static/css/main.047a6e9a.css
  (47 chunked js files following)

Compiled with warnings.

The bundle size is significantly larger than recommended.
[...standard CRA size advisory...]

The build folder is ready to be deployed.
```

- **Exit code: 0**
- Main bundle: `main.1ba2c02c.js` at **959.73 kB** (gzipped — this is the standard CRA reported size, which is bundle-before-gzip; gzipped size is smaller; pre-existing baseline, no regression introduced by this phase)
- "Compiled with warnings" is the standard CRA bundle-size advisory only — pre-existing, not introduced by this phase, not addressable within Plan 03's scope per CLAUDE.md non-negotiable #2 (minimal diff)
- All four regenerated PNGs visible in `banking_api_ui/build/architecture/` after the build (CRA copied them from `public/` as expected)

## Mermaid syntax fixes applied to Plan-01-owned .mmd files during regen

**None.** Plan 01 used the canonical mermaid syntax pattern (14/14 balanced subgraph/end pairs per Plan 01's summary). `bash scripts/build-diagrams.sh` ran end-to-end on the very first try with `[ok]` for all four entries; zero `[fail]` lines were produced. No `.mmd` source was modified in this plan.

## Verification matrix

| Check | Command | Result |
|---|---|---|
| Script syntax (post-bump) | `bash -n scripts/build-diagrams.sh` | exit 0 |
| Pin bumped to @11 (count check) | `grep -c "@mermaid-js/mermaid-cli@11" scripts/build-diagrams.sh` | 1 |
| Pin @10 fully removed | `grep -c "@mermaid-js/mermaid-cli@10" scripts/build-diagrams.sh` | 0 |
| Pipeline runs end-to-end | `bash scripts/build-diagrams.sh` | all 4 `[ok]`, 0 `[fail]` |
| PNG validity (4 files) | `file banking_api_ui/public/architecture/*.png` | all `PNG image data` |
| PNG mtimes newer than .mmd mtimes (4 pairs) | for-loop with `[[ "$src" -nt "$png" ]]` | all 4 `OK:` (none stale) |
| No secret-value patterns in PNGs (smoke) | `grep -E "(api_key\|client_secret\|VAULT_PASSWORD)\s*=\s*[A-Za-z0-9_-]{10,}" *.png` | grep exit 1 (no matches) |
| UI build gate (CLAUDE.md #3) | `cd banking_api_ui && npm run build` | exit 0 |
| PNGs in build/ | `ls banking_api_ui/build/architecture/*.png` | all 4 present (copied from public/) |
| Plan 02 sync test still passes | `CI=true npx react-scripts test --testPathPattern='ArchitectureDiagram.completeness'` | 26/26 in 0.66s |
| mermaid-cli version actually used | `npx -y @mermaid-js/mermaid-cli@11 --version` | 11.15.0 |

## Decisions Made

- **One-character pin bump only:** the Plan 01 / 02 / 03 sequence explicitly partitions ownership — Plan 03 only touches `scripts/build-diagrams.sh` (the pipeline) and the 4 PNG outputs. The ENTRIES array, OUT_DIR, BASEDIR resolution, and the fallback message were left untouched per the plan's explicit "Do NOT" list.
- **No `.mmd` source edits:** the regen ran cleanly on first try; no mermaid syntax fixes were needed in any Plan-01-owned file. (Plan 01's claim of 14/14 balanced subgraph/end pairs is empirically confirmed by the successful render.)
- **Task 3 produced no commit:** the UI build gate is a verification step that produces no source-file changes. `build/` is gitignored. The plan's `<acceptance_criteria>` for Task 3 (exit 0, no new errors, PNGs in `build/architecture/`) is the deliverable, not a code change.
- **Did not address pre-existing CRA bundle-size warning:** "The bundle size is significantly larger than recommended" is a standard CRA advisory that has existed for many phases (visible in prior summaries' build logs); fixing it would require code-splitting work that is far outside Plan 03's scope (CLAUDE.md non-negotiable #2: minimal diff).

## Deviations from Plan

None - plan executed exactly as written.

The plan anticipated two possible deviation paths in Task 2's `<action>` block:
1. **mermaid syntax error in a Plan-01-owned .mmd file:** did not occur. Plan 01's syntax was clean.
2. **First-run Chromium download hang:** did not occur. The render completed in seconds per entry (Chromium was already cached locally from prior repos).

Neither contingency was needed.

## Authentication Gates

None. The mermaid-cli + Puppeteer pipeline runs entirely against npm registry + Google CDN (Chromium download); no authentication required at any step.

## Issues Encountered

1. **Pre-commit hook (advisory):** the lint-staged pre-commit hook reminded twice (Tasks 1 and 2 commits) that `CHANGELOG.md` is not staged. This is advisory only (commits succeed); no CHANGELOG entry is in scope for Plan 03 (pipeline pin bump + asset regen are not user-facing). Both commits landed cleanly (`e17bf0b8`, `d633554f` confirmed via `git log --oneline`).

## User Setup Required

None — the pipeline runs against the npm registry. No environment variables, no PingOne config, no credentials needed.

## Next Phase Readiness

- **Ready for Plan 04** — the PNG outputs are fresh, the DiagramRegeneratePanel admin UI will no longer flag any of the four as stale, and the mermaid-cli pin is at the current major. Plan 04 can now reference the diagram-completeness invariant in the REGRESSION_PLAN §1 row (REQ-DIAGRAM-12) with the confidence that the current PNG assets are 1-to-1 with the current .mmd sources. REQ-DIAGRAM-14 (InteractiveArchDiagram top comment / replace-with-PNG) can also reference `overview.png` as the authoritative static view.

## Known Stubs

None. No stub patterns introduced by this plan (no hardcoded empty values, no placeholder text, no components with unwired data sources). The work is purely pipeline + asset regen.

## Self-Check

Files claimed modified:
- scripts/build-diagrams.sh — FOUND (verified: line 49 contains `@mermaid-js/mermaid-cli@11`; `bash -n` exits 0)
- banking_api_ui/public/architecture/overview.png — FOUND (448713 B, PNG image data 2384×1584)
- banking_api_ui/public/architecture/overview2.png — FOUND (292696 B, PNG image data 2784×1027)
- banking_api_ui/public/architecture/token-flow.png — FOUND (534746 B, PNG image data 2784×2892)
- banking_api_ui/public/architecture/token-flow2.png — FOUND (185407 B, PNG image data 1567×926)

Commits claimed:
- e17bf0b8 — FOUND (`chore(270-03): bump mermaid-cli pin @10 → @11 in build-diagrams.sh`)
- d633554f — FOUND (`feat(270-03): regenerate architecture PNGs from updated .mmd sources`)

Verifications claimed:
- `bash -n scripts/build-diagrams.sh` exit 0 — confirmed
- `bash scripts/build-diagrams.sh` all 4 `[ok]`, 0 `[fail]` — confirmed via stdout
- All 4 PNG mtimes newer than .mmd source mtimes — confirmed via for-loop with `-nt` test
- `cd banking_api_ui && npm run build` exit 0 — confirmed via `/tmp/ui-build-270-03-rerun.log`
- Plan 02 sync test 26/26 passing in 0.66s — confirmed via `npx react-scripts test` output
- mermaid-cli version 11.15.0 — confirmed via `npx --version`

## Self-Check: PASSED

---
*Phase: 270-architecture-diagram-completeness-audit-architecture-system*
*Plan: 03*
*Completed: 2026-05-14*
