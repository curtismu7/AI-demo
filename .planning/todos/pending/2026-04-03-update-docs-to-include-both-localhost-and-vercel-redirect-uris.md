---
created: 2026-04-03T18:49:44.307Z
title: Update docs to include both localhost and Vercel redirect URIs
area: docs
files:
  - docs/PINGONE_MAY_ACT_TWO_TOKEN_EXCHANGES.md
  - docs/PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md
---

## Problem

The token exchange setup guides currently list only the Vercel production redirect URI:

```
https://banking-demo-puce.vercel.app/api/auth/oauthuser/callback
```

Developers setting up locally need to also add:

```
http://localhost:3000/api/auth/oauthuser/callback
```

(or whatever port `REACT_APP_API_PORT` is set to — e.g., `http://localhost:4000/api/auth/oauthuser/callback` when using `run-bank.sh`).

Without the localhost redirect URI on the PingOne app, local development login fails with a `redirect_uri_mismatch` error from PingOne. There is no mention of this in the docs, which is a common stumbling block for first-time setup.

## Solution

In the **Super Banking User App** setup step (Step 2a in the 2-exchange doc, equivalent step in 1-exchange doc), update the **Redirect URIs** row to list both URIs:

| Field | Value |
|-------|-------|
| **Redirect URIs** | `https://banking-demo-puce.vercel.app/api/auth/oauthuser/callback` (production) |
| | `http://localhost:3000/api/auth/oauthuser/callback` (local dev) |
| | `http://localhost:4000/api/auth/oauthuser/callback` (local dev — `run-bank.sh` port) |

Also add a note: "PingOne allows multiple redirect URIs per app. Add all environments you intend to use. The actual URI sent in the authorize request must exactly match one of the registered values."

Check the Postman section too — it lists `https://oauth.pstmn.io/v1/callback` as a one-time setup URI, which is already called out. Confirm that callout is present in both docs.
