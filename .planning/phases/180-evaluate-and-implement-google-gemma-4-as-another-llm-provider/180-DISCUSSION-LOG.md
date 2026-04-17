# Phase 180: Evaluate and Implement Google Gemma 4 — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 180-evaluate-and-implement-google-gemma-4-as-another-llm-provider
**Areas discussed:** Provider integration approach, Model selection & evaluation, Fallback chain position, UI integration

---

## Provider Integration Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Google AI Studio API | Free tier, Google API format, needs GOOGLE_AI_API_KEY | |
| Groq | Already integrated, hosts Gemma models, no new auth | |
| Ollama / LM Studio local | Run locally, OpenAI-compatible endpoint, no API key | ✓ |
| Vertex AI | Enterprise GCP, overkill for demo | |

**User's choice:** Ollama / LM Studio local

### Follow-up: Runtime Options

| Option | Description | Selected |
|--------|-------------|----------|
| Ollama preferred | Document `ollama pull gemma4` | |
| LM Studio preferred | Download in LM Studio | |
| Both documented | Support either, user picks | ✓ |

**User's choice:** Both documented

---

## Model Selection & Evaluation

### Variant

| Option | Description | Selected |
|--------|-------------|----------|
| Gemma 4 27B | Most capable, needs 16GB+ VRAM | |
| Gemma 4 12B | Good balance, ~8GB VRAM | |
| Gemma 4 4B | Fast, lightweight, fits laptops | ✓ |
| You decide | Agent picks | |

**User's choice:** Gemma 4 4B

### Evaluation

| Option | Description | Selected |
|--------|-------------|----------|
| Just integrate | Manual testing only | |
| Quick comparison | 5-10 intent test script, logs accuracy | ✓ |
| You decide | | |

**User's choice:** Quick comparison script

---

## Fallback Chain Position

| Option | Description | Selected |
|--------|-------------|----------|
| Separate provider, user-selectable | Not in chain, standalone in dropdown | |
| Replace LM Studio slot | Gemma as default local model, same endpoint | ✓ |
| Add after LM Studio | Extra local fallback before cloud | |
| You decide | | |

**User's choice:** Replace LM Studio slot

---

## UI Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Add as new option | "Gemma 4 (Local)" separate from LM Studio | |
| Rename + dropdown | "Local Model" with pre-filled model dropdown | ✓ |
| You decide | | |

**User's choice:** Rename to "Local Model (LM Studio / Ollama)" with pre-filled dropdown of model options (not free-text)

---

## Agent's Discretion

- Exact list of pre-filled model names in dropdown
- `.env.example` updates
- Config label updates for Ollama mention

## Deferred Ideas

None
