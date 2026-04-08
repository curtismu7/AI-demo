# Phase 107: Make hostname and redirect URI configurable via admin config page — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** User requirements (captured from conversation)

---

## Phase Boundary

This phase makes the hostname and redirect URI fully configurable via the admin config page, allowing users to:
- Set a custom hostname (default: `api.pingdemo.com`, but supporting localhost, staging domains, production domains, etc.)
- Have all API calls use that hostname
- Have all OAuth redirect URIs automatically use that hostname
- Eliminate manual `.env` file edits for different deployments

**Eliminates:** Manual environment configuration required to switch between localhost, staging, and production deployments.

---

## Decisions

### D-01: Hostname configuration location
- **Decision:** Host the hostname/redirect URI configuration in the admin config page (not `.env`, not environment variables)
- **Rationale:** Makes it runtime-configurable without restarts; accessible to non-developers; supports multi-environment deployments without code changes

### D-02: Hostname as the source of truth
- **Decision:** Once a hostname is configured in admin, use it for:
  - All BFF API calls from frontend (`REACT_APP_API_URL` logic)
  - OAuth redirect URI generation (currently: `${PUBLIC_APP_URL}/api/auth/oauth/callback`)
  - Admin UI internal API calls
  - Any cross-origin fetch URLs
- **Rationale:** Single source of truth prevents mismatches between configured hostname and actual URIs

### D-03: Default hostname
- **Decision:** Default to `api.pingdemo.com` (production domain)
- **Rationale:** Safe default; matches current production setup; can be overridden at runtime

### D-04: Persistent storage
- **Decision:** Store configured hostname in persistent storage (database or persistent config file)
- **Rationale:** Survives server restarts; survives deployments; becomes instance configuration

### D-05: OAuth redirect URI sync
- **Decision:** When hostname changes in admin, OAuth redirect URIs are automatically recalculated and sent to PingOne on next login attempt
- **Rationale:** Prevents stale URI mismatches; simpler than manual PingOne reconfiguration

### D-06: Port handling
- **Decision:** Hostname configuration includes port (e.g., `localhost:3000`, `api.pingdemo.com:4000`, `app.prod.com:443`)
- **Rationale:** Supports non-standard ports; supports local development with specific ports

### D-07: HTTPS enforcement
- **Decision:** Hostname configuration must include schema (`https://` or `http://`). Production strongly recommends HTTPS.
- **Rationale:** OAuth security requirement; explicit about protocol choice

---

## the agent's Discretion

- **Storage mechanism:** Database table, Redis key, in-memory config, or file-based? Agent should choose based on project architecture.
- **UI/UX for config page:** Where exactly in admin config page? Separate card, modal, inline editor? How to validate hostname?
- **Fallback behavior:** If hostname config is missing or invalid, what's the fallback?
- **Audit trail:** Should hostname changes be logged? For security/compliance?
- **Rate limiting:** If hostname can be changed frequently, should there be rate limiting or cooldown?

---

## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### OAuth & Redirect URI Generation
- `banking_api_server/server.js` — Lines where `PUBLIC_APP_URL` is used to construct redirect URIs (especially `/api/auth/oauth/redirect-info`)
- `banking_api_server/.env` — Current environment configuration (PUBLIC_APP_URL, FRONTEND_ADMIN_URL, FRONTEND_DASHBOARD_URL, REACT_APP_CLIENT_URL)
- `.github/skills/oauth-pingone/SKILL.md` — OAuth redirect URI security requirements and validation

### Admin Config Page
- `banking_api_ui/src/pages/AdminPage.js` — Where config controls are added
- `banking_api_ui/src/components/ConfigPanel.js` or similar — Existing config UI components
- `banking_api_server/src/routes/admin.js` or similar — Admin API endpoints

### Current Hostname Usage
- Search codebase for `PUBLIC_APP_URL`, `api.pingdemo.com`, `localhost` to find all hostname references

---

## Specifics

### Requirements from User

> "We need to surface redirect URI (host name really) to config page. By default we use api.pingdemo.com, and localhost or other hostname can be set and we can use that for host name for all API calls and redirect URI's"

### Implementation Scope

1. **Admin Config UI:** Add a hostname/domain input field to the admin config page
2. **Persistent Storage:** Store the configured hostname
3. **Frontend Integration:** Make React frontend use the configured hostname for all API calls
4. **BFF Integration:** Make Express BFF use the configured hostname for OAuth redirect URIs
5. **Verification:** Test with at least 3 hostnames:
   - `api.pingdemo.com:4000` (production)
   - `localhost:3000` (dev)
   - `staging.pingdemo.com:4000` (staging)

### Current Pain Point

- Users must manually edit `.env` to switch between deployments
- OAuth redirect URIs hardcoded in BFF, mismatches cause "Redirect URI mismatch" errors
- Requires BFF restart to take effect

---

## Deferred Ideas

None — Phase 107 scope is fully captured above.

---

*Phase: 107-make-hostname-and-redirect-uri-configurable-via-admin-config-page*
*Context gathered: 2026-04-08 via user requirements*
