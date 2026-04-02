# Phase 25 — Plan 01 Summary

**Status:** Complete  
**Commit:** e260a50

## What was built

- Added `LLM_LANDSCAPE: 'llm-landscape'` to `educationIds.js` after `AGENT_BUILDER_LANDSCAPE`
- Created `LlmLandscapePanel.js` (21KB, ~380 lines) — education drawer with 4 tabs

## Files modified

- `banking_api_ui/src/components/education/educationIds.js` — added `LLM_LANDSCAPE`
- `banking_api_ui/src/components/education/LlmLandscapePanel.js` — NEW

## Panel architecture

Follows identical pattern to `AgentBuilderLandscapePanel.js` and `RARPanel.js`:
- `import EducationDrawer from '../shared/EducationDrawer'`
- Props: `{ isOpen, onClose, initialTabId }`
- Inline styles only (no new CSS file)
- Helper components defined at top of file: `Code`, `ModelCard`

## Tab content

- **commercial** — GPT-4o/o1/o3, Claude 3.5, Gemini 1.5/2.5, Phi-4, Mistral Large 2, Command R+ as `ModelCard` components with colour-coded borders
- **opensource** — Llama 3.x, Mixtral, Qwen 2.5, DeepSeek V3/R1, Gemma 2, Falcon 2 as `ModelCard` components; local inference callout (Ollama, LM Studio, GGUF)
- **howllmswork** — Transformer architecture, training pipeline (`Code` pre block), key concepts (context window, temperature, top-p, tokens, hallucination), inference concepts (KV cache, quantisation, speculative decoding)
- **comparison** — Two `edu-table` HTML tables (commercial + open-source feature matrices) + how-to-choose bullet list + benchmark footnote links
