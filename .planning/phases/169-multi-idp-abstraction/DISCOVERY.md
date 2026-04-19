# Phase 169 Discovery: Multi-IDP OAuth Configuration Abstraction & Federate Portability

**Goal:** Make the banking demo work with any OAuth provider (PingOne, PingFederate, Auth0, Okta, Azure AD, etc.) without code changes beyond configuration.

**Date:** 2026-04-19

---

## Current State: PingOne Hardcodes

### 1. **OAuth Endpoints (CRITICAL — Hardcoded in 8+ places)**

#### Current Pattern
```javascript
// oauth.js, oauthUser.js (+ DUPLICATED in services/)
get _base()                  { return `https://auth.pingone.${this._region}/${this.environmentId}/as`; },
get authorizationEndpoint()  { return `${this._base}/authorize`; },
get tokenEndpoint()          { return `${this._base}/token`; },
get userInfoEndpoint()       { return `${this._base}/userinfo`; },
get jwksEndpoint()           { return `${this._base}/jwks`; },
get issuer()                 { return this._base; },
```

**Hardcoded in:**
- `banking_api_server/config/oauth.js` (admin)
- `banking_api_server/config/oauthUser.js` (user)
- `banking_api_server/services/resourceValidationService.js` (8 calls)
- `banking_api_server/services/pingOneUserService.js` (token endpoint)
- `banking_api_server/services/pingOneAuthorizeService.js` (auth base)
- `banking_api_server/services/mfaService.js` (2 calls)
- `banking_api_server/services/pingoneProvisionService.js`
- `banking_api_server/services/emailService.js`
- `banking_api_server/services/pingoneScopeUpdateService.js` (2 calls)

**Impact if not config:** Cannot swap to Federate, Auth0, Okta (these have different domain URLs)

#### Federate Pattern
```
Token:    https://my-federate.example.com:9031/oauth2/token
Auth:     https://my-federate.example.com:9031/oauth2/authorize
JWKS:     https://my-federate.example.com:9031/oauth2/JWKS
Issuer:   https://my-federate.example.com:9031
```

**Solution:** Add configurable endpoints in configStore:
- `oauth_authorization_endpoint`
- `oauth_token_endpoint`
- `oauth_userinfo_endpoint`
- `oauth_jwks_uri`
- `oauth_issuer`

Compute only if env-like templates exist (`{env_id}` → interpolate).

---

### 2. **OAuth Callback Paths (BLOCKER — Hardcoded in routes)**

#### Current Pattern
```javascript
// server.js
app.use('/api/auth/oauth/callback', authLimiter);
app.use('/api/auth/oauth/user/callback', authLimiter);

// routes/oauth.js
router.get('/callback', callbackHandler);
```

**Problem:** Different IDPs may require different callback paths:
- PingOne: `/api/auth/oauth/callback`
- Federate: `/oauth2/callback` (no `/api/auth` prefix)
- Auth0: `/callback` (single endpoint, app-handled routing)

**Current Solution (INCOMPLETE):** configStore has `admin_redirect_uri` and `user_redirect_uri` fields but the callback **paths are hardcoded** — only the **origin** is configurable.

**Action Required:** Make callback paths configurable OR standardize on `/api/auth/oauth/{providerType}/callback`.

**Solution:** 
- Add `oauth_provider_type: 'pingone' | 'federate' | 'auth0' | 'generic'`
- Create provider-specific route dispatcher in server.js that mounts correct path
- OR: Support configurable callback path via `oauth_admin_callback_path`, `oauth_user_callback_path`

---

### 3. **OAuth CIBA Endpoint (PingOne Specific)**

```javascript
// oauth.js
get cibaEndpoint()  { return `${this._base}/bc-authorize`; },
```

**Problem:** CIBA (Client-Initiated Backchannel Authentication) is PingOne-specific; not all IDPs support it.

**Impact:** Agent HITL (human-in-the-loop) for step-up auth uses CIBA; without it, agent step-up fails.

**Solution:** 
- Add configurable `oauth_ciba_endpoint` (default empty)
- Disable CIBA flows if endpoint not set
- Document fallback: use standard OAuth `/authorize` redirect instead

---

### 4. **PingOne-Specific Claims & Attributes**

#### Population ID (PingOne Specific)
```javascript
// configStore.js
admin_population_id: { public: true, default: '' },

// In routing/permission logic
if (token.attributes.population_id === ADMIN_POPULATION) { role = 'admin'; }
```

**Problem:** PingOne uses "Population" (organizational unit); other IDPs use:
- Azure AD: `app_roles` claim
- Auth0: `roles` claim
- Okta: `groups` claim

**Solution:** Add configurable role claim mapping:
- `role_claim_name: 'population_id' | 'app_roles' | 'groups' | 'custom_role'`
- `role_claim_value_for_admin: 'admin_population_uuid' | 'admin' | string`

---

### 5. **PingOne Authorize API (Decision Endpoints)**

```javascript
// configStore.js
PINGONE_AUTHORIZE_ENABLED: { public: true, default: 'false' },
PINGONE_AUTHORIZE_DECISION_ENDPOINT_ID: { public: true, default: '' },
```

```javascript
// services/pingOneAuthorizeService.js (line 96+)
const authBase = (tld) => `https://auth.pingone.${tld}`;
// Calls to /v1/environments/{envId}/authorize/decision-endpoints/{id}/eval
```

**Problem:** PingOne "Authorize" (PAZ) is proprietary; equivalent in:
- Federate: Policy evaluation engine (different API)
- Auth0: Rules / Actions
- Okta: Policies

**Solution:**
- Abstract PAZ logic into decision provider plugin
- Add `policy_provider_type: 'pingone_authorize' | 'federate_policies' | 'none'`
- Create adapter layer for policy evaluation

---

### 6. **OIDC Discover Protocol (OPTIONAL BUT RECOMMENDED)**

**Current:** Hardcoded endpoint URLs

**Better:** Use OIDC Discovery metadata endpoint (`.well-known/openid-configuration`)

```javascript
// proposal–not yet implemented
const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
const metadata = await fetch(discoveryUrl).then(r => r.json());
const {
  authorization_endpoint,
  token_endpoint,
  userinfo_endpoint,
  jwks_uri,
  issuer,
  // ... other endpoints
} = metadata;
```

**Benefit:** Single config (issuer + region) → auto-fetch all endpoints.

**For Federate:** Just provide `https://my-federate.example.com:9031` and discovery handles the rest.

---

## Configurability Audit: What's Already Configurable

| Component | Current State | Configurable? | Gap |
|-----------|---------------|---------------|-----|
| Environment ID | configStore `pingone_environment_id` | ✅ Yes | N/A |
| Region | configStore `pingone_region` | ✅ Yes | Tied to PingOne URL pattern |
| OAuth endpoints | **Hardcoded** in oauth.js | ❌ No | **CRITICAL** — needs configStore fields |
| Callback paths | Hardcoded routes | ❌ No | **CRITICAL** — needs dispatcher |
| Client ID / Secret | configStore | ✅ Yes | N/A |
| Redirect URIs | configStore | ✅ Yes | N/A |
| Token endpoint auth method | configStore | ✅ Yes | N/A |
| Role claim | Hardcoded PingOne logic | ❌ No | Needs abstraction |
| CIBA endpoint | Hardcoded | ❌ No | Needs configurable, optional |
| Authorize API endpoint | Hardcoded in services | ❌ No | Needs abstraction layer |

---

## Scope for Phase 169: Multi-IDP Abstraction

### **Core Tasks**

#### **Task 1: Extract OAuth Endpoints to ConfigStore**
- Add 5 new fields: `oauth_authorization_endpoint`, `oauth_token_endpoint`, `oauth_userinfo_endpoint`, `oauth_jwks_uri`, `oauth_issuer`
- Modify oauth.js and oauthUser.js to read from configStore instead of hardcoding `https://auth.pingone.${region}...`
- Update all 8 services that build URLs to use configStore getters
- Support environment variable fallbacks: `OAUTH_AUTHORIZATION_ENDPOINT=...` etc.
- Tests: Verify 10 different endpoint URLs can be configured without code change

#### **Task 2: Support OIDC Discovery (Optional But Recommended)**
- Add field: `oauth_issuer_discovery_enabled` (boolean, default false/off)
- If enabled: BFF fetches `.well-known/openid-configuration` from issuer and populates endpoints automatically
- Fallback: If discovery fails, use explicit endpoint configs from Task 1
- Validates: Issuer, auth endpoint, token endpoint, JWKS URI match discovery metadata
- Tests: Verify discovery works for PingOne, mock Federate, Auth0

#### **Task 3: Make OAuth Callback Paths Configurable**
- Add configurable callback paths in configStore: `oauth_admin_callback_path`, `oauth_user_callback_path`
- Default: `/api/auth/oauth/callback`, `/api/auth/oauth/user/callback` (current)
- Creator dynamic route dispatcher in server.js that accepts provider type + builds route handler
- Create adapter layer for handling different callback structures (some IDPs pass tokens in query, some in body)
- Tests: Verify callbacks work with standard PingOne paths and Federate-style `/oauth2/callback`

#### **Task 4: Abstract Role/Population Claim Mapping**
- Extract PingOne-specific role logic from permission checks
- Add configStore fields: `role_claim_name`, `role_claim_value_admin`, `role_claim_value_customer`
- Create `getRoleFromToken(token)` helper that reads claim mapping
- Map PingOne `population_id` → configurable claim lookup
- Tests: Verify role resolution works for:
  - PingOne: `population_id` claim
  - Azure AD: `app_roles` array
  - Auth0: `roles` array
  - Generic: custom claim name

#### **Task 5: Federate-Ready Documentation & Config Template**
- Create `.env.federate.example` template with Federate-specific endpoints
- Document Federate setup (Policy Engine, Grant Types, Callback configuration)
- Create migration guide: "Swap from PingOne to Federate in 5 steps"
- Add Config UI help text explaining IDP-specific settings

### **Non-Scope (Future Phases)**

- PingOne Authorize (PAZ) abstraction — complex enough for separate phase
- CIBA fallback UI flow — defer to user consent phase
- Full multi-tenant IDP routing — defer to enterprise phase

---

## Verification Criteria

After Phase 169:

1. **PingOne Still Works:** Existing PingOne config unchanged; all tests pass
2. **Federate URL Pattern:** Configure endpoints and region for Federate; user login works
3. **Discovery Works:** Set `oauth_issuer_discovery_enabled=true` and issuer; test discover and auto-populate
4. **Role Claim Mapping:** Switch role claim from `population_id` to `app_roles` and re-assign admin role
5. **Documentation:** Federate setup guide exists and is accurate
6. **No Hardcodes:** Grep for `auth.pingone` returns 0 matches in hardcoded patterns (OK in docs/comments)

---

## Risk Register

| Risk | Mitigation | Effort |
|------|-----------|--------|
| Breaking existing PingOne config | Feature flag: `OAUTH_ENDPOINT_OVERRIDE_ENABLED` (default false); existing config still works | Low |
| Discovery metadata mismatch | Fall back to explicit endpoints if discovery fails; log warnings | Med |
| IDP-specific token structures | Create token transformer/adapter layer for claim extraction | High |
| Testing complexity | Rent Federate sandbox or mock; don't require all IDPs for phase pass | Med |

---

## Effort Estimate

- **Task 1:** 2-3 hours (5 endpoint fields + 8 service updates + tests)
- **Task 2:** 3-4 hours (OIDC discovery logic + fallback + tests)
- **Task 3:** 3-4 hours (callback path dispatch + adapter + tests)
- **Task 4:** 2-3 hours (role claim mapping + helpers + tests)
- **Task 5:** 1-2 hours (docs + template + guide)

**Total: ~12-18 hours** → **3-4 Claude execution sessions** if 50% context target.

---

## Downstream Value

- **Q2 2026:** Federate migration path enabled (non-breaking)
- **Future:** Multi-IDP marketplace (Auth0, Okta, Azure AD demo modes)
- **Security:** Decouples from PingOne; reduces single-vendor lock-in
- **Developer Experience:** Setup guide + OIDC discovery = 5-min IDP swap
