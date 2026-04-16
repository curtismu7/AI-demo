---
phase: 166-replace-gemini-with-anthropic
plan: 01
subsystem: api
tags: [anthropic, llm, intent-parsing, nlp]

requires:
  - phase: 165-lm-studio-local-model
    provides: LM Studio as 2nd fallback in intent chain
provides:
  - Anthropic Claude as 3rd LLM fallback replacing Gemini
  - Updated .env.example with ANTHROPIC_MODEL config
affects: [intent-parsing, agent, nlp]

tech-stack:
  added: [anthropic-messages-api]
  patterns: [abort-controller-timeout, multi-provider-fallback-chain]

key-files:
  created: []
  modified:
    - banking_api_server/services/geminiNlIntent.js
    - banking_api_server/.env.example

key-decisions:
  - "Used claude-3-5-haiku-20241022 as default model for fast, cheap intent parsing"
  - "10s timeout for Anthropic (vs 5s for LM Studio) since it's a remote API"
  - "Kept filename as geminiNlIntent.js to avoid breaking imports"

patterns-established:
  - "Anthropic Messages API direct fetch pattern with AbortController timeout"

requirements-completed: [INTENT-CHAIN-01]

duration: 5min
completed: 2026-04-16
---

# Phase 166: Replace Gemini with Anthropic Summary

**NL intent chain now uses Anthropic Claude as 3rd fallback: Groq → LM Studio → Anthropic → heuristic**

## Performance

- **Duration:** 5 min
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Replaced parseWithGemini with parseWithAnthropic using Anthropic Messages API
- Updated chain order from Groq→LM Studio→Gemini→heuristic to Groq→LM Studio→Anthropic→heuristic
- Added ANTHROPIC_MODEL env var support (default: claude-3-5-haiku-20241022)
- Updated .env.example documentation with new chain description

## Task Commits

1. **Task 1+2: Replace Gemini with Anthropic and verify** - `1bbf8b7` (feat)

## Files Created/Modified
- `banking_api_server/services/geminiNlIntent.js` - Replaced parseWithGemini with parseWithAnthropic, updated chain
- `banking_api_server/.env.example` - Updated AI/LLM section with new chain docs and ANTHROPIC_MODEL

## Decisions Made
- Used claude-3-5-haiku-20241022 as default — fast and cheap for JSON routing
- 10s timeout (vs Gemini's no timeout) — prevents hanging on slow responses
- Kept filename geminiNlIntent.js to avoid breaking require() across codebase

## Deviations from Plan

None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - ANTHROPIC_API_KEY already exists in .env; ANTHROPIC_MODEL is optional.

## Next Phase Readiness
Intent chain fully operational with new Anthropic fallback. No blockers.

---
*Phase: 166-replace-gemini-with-anthropic*
*Completed: 2026-04-16*
