---
title: Fix resource names in PINGONE_RESOURCES_AND_SCOPES_MATRIX.md to match actual PingOne console
area: docs
status: pending
created: 2026-04-14
priority: high
---

## Problem

The scope/resource matrix doc (`docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md`) and per-app scope tables use generic placeholder names instead of the actual PingOne resource names visible in the console.

## Actual PingOne Resource Names (from screenshot)

| PingOne Console Name | ID |
|---|---|
| OpenID Connect | a9ffb056-e14d-421b-b214-572423b8c110 |
| PingOne API | b0500023-a94d-4730-a85d-f25603cdd7e5 |
| Super Banking Agent Gateway | c9d85ed6-15b2-488d-8085-25f005a1f92f |
| Super Banking AI Agent Service | 041502b7-9c80-43aa-bf2c-bc5cf41e4bf8 |
| Super Banking Banking API | af187eab-494a-4acc-b945-013999e5ccd6 |
| Super Banking MCP Gateway | 387b1be5-963f-4400-a5cd-68406ccce82a |
| Super Banking MCP Server | 6769d0a4-405d-444e-a3a7-1bfd6fa04c94 |

## What to Fix

1. Replace "Main Banking Resource Server" → "Super Banking Banking API" throughout
2. Replace "MCP Resource Server" → "Super Banking MCP Server" throughout
3. Add missing resources to doc: Agent Gateway, AI Agent Service, MCP Gateway
4. Update per-app scope tables to reference the correct resource name in every row
5. Include resource IDs for reference

## Files

- `docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md` — primary
- `docs/PINGONE_APP_SCOPE_MATRIX.md` — secondary
