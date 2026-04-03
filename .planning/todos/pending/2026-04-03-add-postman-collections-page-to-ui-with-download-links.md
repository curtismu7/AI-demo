---
created: 2026-04-03T13:16:42.904Z
title: Add Postman Collections page to UI with download links
area: ui
files:
  - banking_api_ui/src/components/
  - docs/BX-Finance-MCP-Tools.postman_collection.json
  - docs/BX-Finance-BFF-API.postman_collection.json
  - docs/BX-Finance-1-Exchange-Step-by-Step.postman_collection.json
  - docs/BX Finance — 1-Exchange Delegated Chain — pi.flow.postman_collection.json
  - docs/BX Finance — 2-Exchange Delegated Chain — pi.flow.postman_collection.json
  - docs/BX-Finance-Advanced-Utilities.postman_collection.json
  - docs/AI-IAM-CORE Webinar.postman_collection.json
  - docs/PingOne Authentication v4 - MFA included.postman_collection.json
  - docs/BX-Finance-Shared.postman_environment.json
---

## Problem

After phase 36, the repo has 7 Postman collections and 1 shared environment in `docs/`. There is no page in the UI that tells users these collections exist, what each one covers, or how to get them. Users must browse GitHub or know to look in `docs/` — there is no discoverability.

## Solution

Create a new React page (e.g. `/postman` route) in `banking_api_ui` that:
- Lists all available Postman collections with name, description, and intended audience (learner / demo runner / engineer)
- Lists the shared BX-Finance environment file with setup instructions
- Provides a download link for each `.json` file (served as static assets or via BFF route)
- Includes a brief setup checklist (import environment first, set variables, run collections in order)
- Consistent with existing page styling (BX Finance design system)

Collections to list (after phase 36):
1. BX-Finance-Shared.postman_environment.json — shared environment (import first)
2. BX-Finance-1-Exchange-Step-by-Step.postman_collection.json — learners / workshops
3. BX Finance — 1-Exchange Delegated Chain — pi.flow — demo runners
4. BX Finance — 2-Exchange Delegated Chain — pi.flow — demo runners / engineers
5. BX-Finance-Advanced-Utilities — PAZ, revocation, exchange mode, audit
6. BX-Finance-MCP-Tools — MCP server direct endpoints (added phase 36)
7. BX-Finance-BFF-API — new BFF API endpoints (added phase 36)
8. AI-IAM-CORE Webinar — webinar reference (moved to docs/ in phase 36)
9. PingOne Authentication v4 - MFA included — reference collection
