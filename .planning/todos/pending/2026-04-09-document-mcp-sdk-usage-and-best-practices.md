---
created: 2026-04-09T23:15:14.579Z
title: Document MCP SDK usage and best practices
area: docs
files:
  - banking_mcp_server/package.json
  - banking_mcp_server/src/index.ts
  - .github/skills/mcp-server/SKILL.md
  - CLAUDE.md
---

## Problem

The project uses `@modelcontextprotocol/sdk` (the official open-source Model Context Protocol SDK from Anthropic) but this is not well-documented in user-facing guides or architecture docs. Developers new to the codebase should understand:

1. **What the MCP SDK is** — Official Anthropic SDK for building MCP servers/clients
2. **How it's used in this project** — Tool registration, WebSocket communication, auth challenges
3. **Key capabilities** — Resource discovery, prompt management, session handling
4. **Deployment patterns** — WebSocket server hosting (Render.com, not Vercel)
5. **Best practices** — Error handling, auth flow integration, token exchange with RFC 8693

Currently, this knowledge exists only in SKILL.md and scattered comments. Should be consolidated into:
- **Technical guide** (docs/MCP_SDK_GUIDE.md or section in ARCHITECTURE.md)
- **Skill documentation** (already in .github/skills/mcp-server but could be expanded)
- **Code comments** (docstrings for main MCP service patterns)

## Solution

1. Create MCP SDK documentation covering:
   - Package overview (`@modelcontextprotocol/sdk@^0.5.0`)
   - Tool registration patterns used in banking_mcp_server
   - WebSocket protocol and auth challenge handling
   - Session + RFC 8693 token exchange integration
   - Deployment (Render.com, Railway, Fly.io — NOT Vercel)
   - Error handling and logging

2. Link from CLAUDE.md to MCP documentation  
3. Add examples from bankingAgentLangChainService.js (LangChain + MCP integration)
4. Document when to use MCP vs direct API calls

## Tags

docs, mcp, architecture, integration
