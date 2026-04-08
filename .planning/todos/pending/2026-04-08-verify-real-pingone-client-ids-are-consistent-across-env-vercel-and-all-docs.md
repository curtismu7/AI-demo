---
created: 2026-04-08T11:13:43.389Z
title: "Verify real PingOne client IDs are consistent across .env, Vercel, and all docs"
area: "docs"
files:
  - banking_api_server/.env
  - banking_api_server/.env.example
  - banking_mcp_server/.env
  - banking_mcp_server/.env.example
  - docs/PINGONE_MAY_ACT_SETUP.md
  - .planning/quick/*.md
---

## Problem

PINGONE_MAY_ACT_SETUP.md was just updated with real PingOne client IDs from the user's production tenant:

- **Super Banking Admin App (BFF):** `14cefa5b-d9d6-4e51-8749-e938d4edd1c0`
- **Super Banking User App:** `b2752071-2d03-4927-b865-089dc40b9c85`
- **Super Banking AI Agent App:** `2533a611-fcb6-4ab9-82cc-9ab407f1dbda`
- **Super Banking MCP Token Exchanger:** `630b065f-0c28-41c2-81ed-1daee811285`
- **Super Banking Worker Token:** `95dc9461-5e0a-4a8b-a8ba-b587b244e005`

However, the `.env`, `.env.example`, Vercel environment variables, and other documentation may still reference:
- Old/stale client IDs
- Placeholder values
- Inconsistent naming (does `.env` use `PINGONE_CORE_CLIENT_ID` or `PINGONE_ADMIN_CLIENT_ID`? etc.)

Need to audit all configuration and documentation sources to ensure they use the correct real client IDs and names.

## Solution

1. **Audit `.env` and `.env.example`:**
   - Verify `PINGONE_CORE_CLIENT_ID` matches `14cefa5b-d9d6-4e51-8749-e938d4edd1c0` (Super Banking Admin App)
   - Verify `PINGONE_CORE_USER_CLIENT_ID` matches `b2752071-2d03-4927-b865-089dc40b9c85` (Super Banking User App)
   - Verify `MCP_CLIENT_ID` matches `630b065f-0c28-41c2-81ed-1daee811285` (Super Banking MCP Token Exchanger)
   - Check for stale/deleted client IDs and remove or update them
   - Confirm all env var names align with canonical naming used by the code

2. **Audit Vercel environment variables:**
   - Run `vercel env ls` and compare each value against the real IDs
   - Ensure production environment has the same real IDs as local `.env`
   - Remove any deprecated/renamed variables from Vercel

3. **Audit other docs:**
   - Check `.planning/quick/*.md` for any hardcoded client IDs
   - Check any other setup/configuration documents
   - Update any references to placeholder app names (e.g., "Super Banking Banking App" vs "Super Banking Admin App")

4. **Verify banking_mcp_server configuration:**
   - Ensure `banking_mcp_server/.env` has correct `MCP_CLIENT_ID` for `630b065f-0c28-41c2-81ed-1daee811285`
   - Update `banking_mcp_server/.env.example` if different from actual deployed config

5. **Commit clean-up:**
   - Update any files that had discrepancies
   - Add entry to CHANGELOG.md if changes made to configuration examples
