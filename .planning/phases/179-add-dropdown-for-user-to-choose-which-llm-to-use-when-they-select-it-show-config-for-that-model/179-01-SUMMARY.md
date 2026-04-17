---
phase: 179-llm-selector
plan: 01
subsystem: ui
tags: [react, llm, config, dropdown, provider-selector]
requires: []
provides:
  - Dropdown-based LLM provider and model selector in Config page
affects: [config-page]
tech-stack:
  added: []
  patterns: [dropdown-config-selector]
key-files:
  created: []
  modified:
    - banking_api_ui/src/components/Config.js
key-decisions:
  - "Dropdown selects replace button row — cleaner, focuses on active provider"
  - "Model dropdown shows provider-specific models from status.provider_models"
  - "Only active provider API key field shown (not all 4 simultaneously)"
  - "handleModelChange sends POST with just {model} — independent of provider switch"
patterns-established:
  - "Config dropdown pattern: select + onChange → POST to BFF → update local state"
requirements-completed: [LLM-01]
duration: 10min
completed: 2026-04-17
---

# Phase 179 Plan 01: LLM Dropdown Provider & Model Selector Summary

**Refactored LLM config from button row to dropdown selectors with contextual API key display**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-04-17
- **Tasks:** 1 (refactor LangChainAgentConfig render)
- **Files modified:** 1

## Accomplishments
- Provider selection: `<select>` dropdown replacing 5 buttons (Groq, OpenAI, Anthropic, Google AI, Ollama)
- Model selection: new `<select>` dropdown showing models for active provider from `status.provider_models`
- API key: only active provider's key field shown (was showing all 4 simultaneously)
- Ollama: dedicated "no key needed" message
- New `handleModelChange` function for independent model switching via POST

## Task Commits

1. **Task 1: Refactor LangChainAgentConfig** — `c56cc66` (feat)

## Files Created/Modified
- `banking_api_ui/src/components/Config.js` — Refactored LangChainAgentConfig render (58 insertions, 29 deletions)

## Decisions Made
- Kept all existing state management and API call patterns unchanged
- Only modified the render output and added handleModelChange

## Deviations from Plan
None — plan executed exactly as written

## Self-Check: PASSED

---
*Phase: 179-llm-selector*
*Completed: 2026-04-17*
