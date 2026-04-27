---
plan: 237-04
status: complete
commits: [b7a326ff]
---

# Plan 237-04 Summary

## What was done

- Added `GET /api/rfc9728/all` BFF route — fetches live `/.well-known/oauth-protected-resource` from BFF, MCP server, MCP gateway, MCP invest
- Added `TokenAudienceChain` diagram component — visual flow showing olb-resource → mcp-gw → mcp-olb/mcp-invest audience narrowing
- RFC 9728 metadata displayed live in education panel with real server responses
