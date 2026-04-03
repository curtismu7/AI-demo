# Phase 23: LangChain Modernization — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `23-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-02
**Areas discussed:** A, B, C, D

---

## Pre-discussion: Codebase Assessment

Scouted `langchain_agent/` before presenting gray areas. Key findings:

- `requirements.txt`: `langchain==0.0.353` (12+ months behind 0.3.x), `openai<1.0.0` (blocks OpenAI SDK 1.x), `pydantic<2.0.0` (blocks most modern Python packages)
- `src/agent/langchain_mcp_agent.py`: uses deprecated `from langchain.llms import OpenAI` and `from langchain.chat_models import ChatOpenAI` — both removed in 0.3.x
- Uses old `AgentExecutor + create_openai_functions_agent` pattern — replaced by LCEL in 0.2+
- `src/config/settings.py` `LangChainConfig`: only `openai_api_key` — no other provider support
- `groq>=0.4.0` in requirements.txt but **never used by LangChain** — only by the BFF's `groqNlIntent.js`
- `langchain_agent/frontend/` has no model selector UX anywhere

---

## Area A — Multi-Provider Model Support

**Context presented:**
- Groq already in BFF for NL intent but not wired to LangChain
- LangChain 0.3.x has official packages for all major providers, same `BaseChatModel` interface

**Options presented:**
1. OpenAI + Groq (2 providers)
2. OpenAI + Groq + Anthropic (3 providers)
3. OpenAI + Groq + Anthropic + Google Gemini (4 providers)
4. All of the above + Ollama (local/air-gapped)

**Decision: Option 4** — All 4 cloud providers (OpenAI, Groq, Anthropic, Gemini) + Ollama.

**Rationale:** Demo narrative = "model-agnostic security." Ollama makes the on-premise / regulated-industry case concrete. Default provider = Groq (already has `GROQ_API_KEY` in BFF env, works out of the box).

---

## Area B — Model Selector UI Location

**Options presented:**
1. Widget gear icon only (live switching)
2. Config page only (pre-configuration)
3. Both — widget gear for live switching + Config page for defaults, synced via BFF session

**Decision: Option 3** — Both surfaces, explicitly including the banking UI Config/Demo Data page.

**Design details:** Widget header shows active provider+model as a badge (`⚡ Groq · llama-3.1-8b`). Both surfaces write to the same BFF session key (`langchain_config`).

---

## Area C — API Key Handling

**Options presented:**
1. Session-only via BFF (keys stored in server-side Redis session, never returned to browser)
2. LocalStorage (fast to build, contradicts BFF token custodian pattern being taught)
3. Option 1 + visible "🔒 key set (session only)" indicator + Clear button per provider

**Decision: Option 3** — BFF session + visible indicator + Clear button.

**Rationale:** LocalStorage explicitly rejected — it directly contradicts the credential security pattern the demo teaches. Option 3 turns the key handling into an active teaching moment: audiences see the "key is set, not visible" pattern mirror the OAuth token custodian pattern.

---

## Area D — Education Page Location and Depth

**Discovery:** 19 existing edu panels (`EDU` in `educationIds.js`), all auth/identity focused. LangChain would be the first AI framework/orchestration panel — a different category.

**Options presented:**
1. New sidebar panel only (30-second overview)
2. Dedicated `/langchain` route only (full-depth page)
3. Both — sidebar panel (overview) + `/langchain` deep-dive page, panel has "Deep dive →" link

**Decision: Option 3** — Two-tier: sidebar panel overview + `/langchain` full page.

**Content scope for `/langchain` page:** Architecture diagram, LCEL chain walkthrough, provider comparison table, live "current model" indicator, why keys stay server-side, why model-agnostic auth matters.
