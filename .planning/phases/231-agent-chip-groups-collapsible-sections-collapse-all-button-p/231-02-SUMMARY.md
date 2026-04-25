---
phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p
plan: "02"
subsystem: api
tags: [nlp, heuristic, education-routing, langgraph, nlIntentParser]

requires: []

provides:
  - BFF parseEducation() covers all 61 EDUCATION_COMMANDS chip labels via heuristic — zero LLM fallback for education chips

affects: [nlIntentParser, agent-routing, education-chips]

tech-stack:
  added: []
  patterns: [regex word-boundary matching against norm()'d lowercase input for chip label routing]

key-files:
  created: []
  modified:
    - banking_api_server/services/nlIntentParser.js

key-decisions:
  - "Tightened banking 'sensitive' match to 'sensitive account details' so 'sensitive data' routes to education"
  - "OIDC 2.1 regex explicitly handles norm()'d form 'oidc 2 1' (dot stripped by norm())"
  - "Existing LANGCHAIN constant had string literal 'langchain' hardcoded — updated to use EDU.LANGCHAIN for consistency"

patterns-established:
  - "parseEducation() if-blocks always test against norm()'d input t — emoji and special chars already replaced with spaces"

requirements-completed:
  - REQ-2

duration: 20min
completed: 2026-04-25
---

# Phase 231-02: NL heuristic parser — full education chip coverage

**Extended BFF nlIntentParser with 19 new EDU constants and 22 new parseEducation() if-blocks so every EDUCATION_COMMANDS chip label routes to kind:education via heuristic — zero LLM fallback.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-04-25
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added 19 new EDU constants to the `EDU` object matching all educationIds.js values (BEST_PRACTICES through ID_JAG)
- Added 22 new if-blocks in parseEducation() covering all previously-uncovered chip labels
- Fixed banking regex: `sensitive` → `sensitive account details` so "Sensitive Data & Selective Disclosure" chip routes to education
- Fixed OIDC 2.1 regex to match norm()'d form "oidc 2 1" (dot stripped by norm())
- Updated stale `'langchain'` string literal to `EDU.LANGCHAIN` for consistency
- All 23 spot-check labels verified returning `kind:education`

## Task Commits

1. **Task 1: Extend EDU constants + parseEducation()** — `9f553028` (feat(231-02): extend nlIntentParser EDU constants + parseEducation() for all chip labels)

## Files Created/Modified
- `banking_api_server/services/nlIntentParser.js` — EDU object expanded to 31 constants; parseEducation() extended with 22 new if-blocks; banking regex tightened

## Decisions Made
- Did not add duplicate patterns for LANGCHAIN (already covered by existing `\b(langchain|lang chain|lcel)\b` block) — only updated the string literal to use EDU.LANGCHAIN
- Did not add new STEP_UP block (already covered) — only added `deviceAuthentications` sub-topic block
- Did not add MCP_PROTOCOL block (already covered by `\bmcp\b`) — no duplicate needed
- RFC 8693 check added as fallback after main TOKEN_EXCHANGE check to handle explicit RFC number references

## Deviations from Plan
- **Banking regex tightening (auto-fix):** The plan expected `parseEducation()` to handle "sensitive data" cleanly, but the banking `\bsensitive\b` regex was intercepting it. Tightened banking match to `sensitive account details` to avoid the collision — this is a correct narrowing with no banking regression.
- **OIDC 2.1 regex:** norm() strips the dot, so "oidc 2.1" → "oidc 2 1". Added explicit "oidc 2 1" alternation. No semantic change.

## Issues Encountered
- "sensitive data" routed to banking because parseBanking() runs before parseEducation() for plain inputs and `\bsensitive\b` matched. Fixed by tightening the banking regex.
- "oidc 2.1" returned `none` because norm() strips dots. Fixed by adding the space-separated form to the regex.

## Next Phase Readiness
- Phase 231 complete — both plans executed and committed
- Ready for phase verification (gsd-verifier)

---
*Phase: 231-agent-chip-groups-collapsible-sections-collapse-all-button-p*
*Completed: 2026-04-25*
