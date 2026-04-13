---
created: "2026-04-02T13:51:20.140Z"
title: "Commit, push Phase 23 to git and deploy to Vercel"
area: "tooling"
files:
  - langchain_agent/requirements.txt
  - langchain_agent/src/agent/llm_factory.py
  - langchain_agent/src/agent/langchain_mcp_agent.py
  - banking_api_server/routes/langchainConfig.js
  - banking_api_ui/src/components/Config.js
  - banking_api_ui/src/pages/LangChainPage.js
---

## Problem

Phase 23 (langchain-modernization) is complete locally on branch `fix/dashboard-fab-positioning` with 4 plan commits:
- `f80d934` feat(23-01): langchain upgrade to 0.3.x — LCEL migration + multi-provider factory
- `343951c` feat(23-02): langchain BFF config routes + Config page LangChain section
- `91789e8` feat(23-03): ChatWidget LangChain provider badge + settings panel
- `c35b95e` feat(23-04): LangChain education panel + /langchain page + NLU wiring
- `72f9d60` docs(23): phase summaries + STATE.md advance to Phase 24

These commits have NOT been pushed to the remote (`curtismu7/banking-demo`) or deployed to Vercel.
The branch `fix/dashboard-fab-positioning` needs to be pushed (or merged to main) and a Vercel deployment triggered.

## Solution

1. Push the branch: `git push origin fix/dashboard-fab-positioning`
2. If ready to merge: open PR → merge to main → Vercel auto-deploys
3. Or trigger a manual Vercel deploy from dashboard / `vercel --prod`
4. Verify `/langchain` page loads on production
5. Verify `GET /api/langchain/config/status` returns 200 in production
6. Confirm ChatWidget badge shows `⚡ Groq · llama-3.1-8b-instant` for default config
