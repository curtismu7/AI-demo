---
quick_id: 260403-ief
title: Rename all PingOne apps and resources from BX Finance to Super Banking
type: quick
---

## Objective

Rename all PingOne apps and resources in env d02d2305 from "BX Finance" to "Super Banking"
to match the code rename (quick task 260403-ibs).

## Execution

No worker app has p1:update:application or p1:update:resource scopes — manual console changes required.

### Applications (Connections → Applications)

| Current | New |
|---|---|
| BX Finance User App | Super Banking User App |
| BX Finance Admin App | Super Banking Admin App |
| BX Finance AI Agent | Super Banking AI Agent |
| BX Finance MCP Token Exchanger | Super Banking MCP Token Exchanger |
| BX Finance MCP Introspector | Super Banking MCP Introspector |

### Resources (Connections → Resources)

| Current | New |
|---|---|
| BX Finance AI Agent Service | Super Banking AI Agent Service |
| BX Finance Agent Gateway | Super Banking Agent Gateway |
| BX Finance MCP Server | Super Banking MCP Server |
| BX Finance MCP Gateway | Super Banking MCP Gateway |
| BX Finance Banking API | Super Banking Banking API |

## Optional: API approach

If MCP Introspector (bdf0fa76) is granted p1:update:application + p1:update:resource
on the PingOne API resource, I can run PATCH calls to rename all 10 in one shot.

## Success Criteria

- [ ] All 5 apps renamed in PingOne console
- [ ] All 5 resources renamed in PingOne console
- [ ] Display names visible in console match "Super Banking *"
