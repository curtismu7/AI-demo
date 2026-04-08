# Phase 97: Demo Config with Introspection and JWT Validation Options — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning
**Source:** Phase description (add-phase workflow)

---

## Phase Boundary

This phase focuses on making token validation configurable in the banking demo:

1. **Demo Configuration** — Expose introspection and JWT validation as toggle options in the demo configuration UI
2. **Introspection API Validation** — Verify that the BFF-to-PingOne introspection endpoint is working correctly (Phase 91 Wave 1)
3. **Validation Mode Showcase** — Allow operators to switch between introspection (real-time) and JWT (local) token validation modes
4. **Documentation** — Document which validation method is used, when to use each, and troubleshoot failures

**Scope includes:**
- Configuration table/UI showing current validation mode
- API test endpoints or diagnostic tools to verify introspection connectivity
- Clear indication in logs of which validation method is being used
- Documentation of introspection response handling

**Out of scope (for later phases):**
- Implementing additional validation methods (MFA, device binding, etc.)
- Changing the introspection caching strategy
- PingOne account-wide introspection policy changes

---

## Implementation Decisions

### Decision Area: Configuration Exposure

- **Configurable Mode Toggle:** Allow operators to select between `introspection` and `jwt` validation modes via demo config page
- **Default Mode:** Default to introspection (RFC 7662 standard; prevents using expired tokens)
- **Storage:** Persist mode selection in configStore (Phase 65) so it survives page refresh
- **Admin-only:** Only admin users can change validation mode (security boundary)

### Decision Area: Introspection API Testing

- **Health Check Endpoint:** Create `/api/health/introspection` that tests PingOne connectivity
- **Test Token:** Use a test token to validate round-trip: generate → send to introspection endpoint → get response
- **Error Handling:** If introspection fails, fall back to JWT validation (graceful degrada tion)
- **Logging:** Log all introspection requests and failures for diagnostics

### Decision Area: Demo UI Display

- **Config Panel Update:** Add section showing "Token Validation Mode: [introspection | jwt]"
- **Indicator:** Show "✓ Introspection working" or "⚠️ JWT fallback (introspection unavailable)"
- **Test Button:** "Test PingOne Connection" button that calls `/api/health/introspection`

### Decision Area: Documentation

- **Decision Document:** Create INTROSPECTION_VALIDATION_GUIDE.md explaining:
  - When to use introspection (user-facing APIs requiring real-time token revocation)
  - When to use JWT (internal/trusted APIs with lower revocation latency requirements)
  - Troubleshooting introspection failures (network, PingOne outages, credentials)
- **Configuration:" Document which env vars control validation mode (VALIDATION_MODE, PINGONE_INTROSPECTION_ENDPOINT, etc.)

### Decision Area: the agent's Discretion

- How to structure the demo config UI section (card, table, dropdown, etc.)
- Exact format of introspection test response
- Retention/logging policy for introspection test results
- Scope of "health check" vs full functional test

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

These files define the validation patterns, introspection endpoint, and configuration structures that this phase depends on.

### Token Validation (Phase 91 Wave 1 — Complete)
- `banking_api_server/services/tokenIntrospectionService.js` — RFC 7662 token introspection service (validates tokens via PingOne)
- `banking_api_server/routes/introspect.js` — POST `/api/introspect` endpoint (handles introspection requests)
- `banking_api_server/__tests__/tokenIntrospection.test.js` — Test suite (20 tests, all passing)

### Configuration (Phase 65 — Existing)
- `banking_api_server/config/configStore.js` — Central configuration store for demo settings
- `banking_api_ui/src/config/FeatureConfig.tsx` — React config component (UI for demo settings)

### Environment Variables
- `.env.example` — Current env var structure (PINGONE_INTROSPECTION_ENDPOINT, WORKER_CLIENT_ID, WORKER_CLIENT_SECRET)
- `banking_api_server/config/` — Config directory structure

### OAuth/Token Specifications
- `docs/RFC8693_TOKEN_EXCHANGE_GUIDE.md` — RFC 8693 token exchange (tokens being validated)
- `docs/ENVIRONMENT_MAPPING_AUD_AUDIT.md` (Phase 96) — Audience claim values (aud is validated alongside token validity)

### Demo Configuration (Phase 64 — Existing)
- `banking_api_ui/src/pages/ConfigPage.tsx` — Demo configuration UI
- `docs/DEMO_CONFIG_GUIDE.md` — Configuration documentation

---

## Specific Ideas

- **Introspection Mode:** Display "this token was validated via PingOne" in token inspector
- **JWT Mode:** Display "this token was validated locally (RSA signature check)"
- **Cache Indicator:** Show how long the introspection result is cached (helps debug token revocation timing)
- **Credentials Check:** Verify WORKER_CLIENT_ID and WORKER_CLIENT_SECRET are set before introspection call
- **Token Filtering:** Don't introspect system tokens (e.g., internal API key tokens) — only user/agent tokens

---

## Deferred Ideas

- Device binding validation (check user's geolocation/device against PingOne records)
- MFA re-authentication on-demand via UI
- Token revocation UI (admin can revoke tokens for specific users)
- Introspection performance metrics (latency, cache hit rate dashboard)
- Custom introspection cache TTL configuration via UI

---

*Phase: 97 — Demo config with introspection and JWT validation options*
*Context gathered: 2026-04-08*
