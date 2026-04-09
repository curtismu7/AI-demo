# TODO: PingOne Resources × Scopes Matrix — COMPLETED ✅

**Completed:** April 9, 2026 — Commit 5b646c0

**Problem Statement:**
User's question: "My PingOne app is getting `agent:invoke` from resource Super Banking Agent gateway. Is that the right resource? I need to know apps, resources, scopes on apps in a table. We already did this research, find the doc or create a new one."

**Discovery:**
- Phase 69.1 (PINGONE_NAMING_STANDARDIZATION_AUDIT.md) standardized scope: `banking:ai:agent:read` (NOT `agent:invoke`)
- Information scattered across 5+ documents: 
  - PINGONE_APP_SCOPE_MATRIX.md (partial)
  - SCOPE_AUDIT_REPORT.md (scope definitions)
  - banking_api_server/config/scopes.js (code-based truth)
  - .env.example files (env mappings)
  - PINGONE_AUTHORIZE_PLAN.md (partial)
- No single authoritative matrix existed

**Solution Delivered:**

### New Document: `docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md`

**Comprehensive, authoritative reference with 9 sections:**

1. **PingOne Resource Servers** — All 3 resources (Main Banking, MCP, PingOne API)
   - Resource names, URIs, type, purpose, token audience
   - Complete scope tables for each resource
   
2. **Applications × Resources × Scopes** — All 4 OAuth apps
   - Admin OAuth App (grants + RFC 8693 token exchange)
   - Customer OAuth App (PKCE, delegation scopes)
   - Management Worker App (PingOne API scopes)
   - Optional Agent MCP Exchanger
   
3. **Scope Standardization (Phase 69.1)** — Phase 69.1 consolidation
   - Naming convention: `banking:*` prefix, `ai:agent` subdomain
   - Phase 69.1 standardized names: `banking:ai:agent:read` (NOT `agent:invoke`, NOT `banking:agent:invoke`)
   - Legacy/wrong names highlighted with ❌
   
4. **Multi-Resource Scope Requests** — OIDC + custom banking scopes
   - Pattern explanation
   - Why `resource=` parameter can be omitted
   - `ENDUSER_AUDIENCE` audience binding
   
5. **Audience (RFC 8707) Binding** — Token audience lifecycle
   - At issuance vs at RFC 8693 exchange
   - How `aud` claim matches resource URI
   
6. **Environment Variable Reference** — All env vars mapped to scopes/resources
   - CLIENT IDs (admin, user, worker, agent)
   - Resource URIs (MCP_SERVER_RESOURCE_URI, etc.)
   - Audience validation (ENDUSER_AUDIENCE, etc.)
   
7. **Quick Verification Checklist** — PingOne Console verification
   - Main Banking Resource checks
   - MCP Resource checks  
   - App scope grant verification
   - RFC 8693 token exchange status
   
8. **Troubleshooting** — Common issues with solutions
   - "Agent scope not in token" → cause + verification steps
   - "`invalid_scope` at authorization" → multi-resource pattern debugging
   
9. **Related Files** — Cross-references to code and docs

**Total: 372 new lines, 16 KB document**

### Updated Document: `docs/PINGONE_APP_SCOPE_MATRIX.md`

- Added reference to new comprehensive matrix at opening
- Updated "See also" section to emphasize new matrix as **START HERE**
- Maintains existing operational guidance while pointing to authoritative source

**Answers User's Questions:**

✅ **"Is agent:invoke from Super Banking Agent gateway the right resource?"**
- NO — agent:invoke is legacy/wrong
- Correct: `banking:ai:agent:read` (per Phase 69.1)
- See: §3 "Scope Standardization" in new matrix

✅ **"I need a table of apps, resources, scopes on apps"**
- YES — see §2 "Applications × Resources × Scopes"
- Shows all 4 apps with their resources, grant types, scopes

✅ **"We already did this research"**
- YES — Phase 69.1 (PINGONE_NAMING_STANDARDIZATION_AUDIT.md)
- Consolidated into new matrix from all disparate sources

**Implementation Details:**

- **Consolidated from:** 5+ source documents
- **Code sources verified:** config/scopes.js, config/oauthUser.js, config/oauth.js
- **Phase 69.1 alignment:** Verified naming conventions match PINGONE_NAMING_STANDARDIZATION_AUDIT.md
- **Audience patterns:** RFC 8693 + RFC 8707 properly documented
- **Environment mappings:** All 8+ env vars cross-referenced

**Testing Guide:** 
2 matrix tables with status indicators (✅ enabled, ❌ wrong, — N/A):
- Each resource shows which apps can use it
- Each app shows scopes on each resource
- Verification checklist guides PingOne Console inspection

**Deployment Next Steps:**

1. ✅ Code fixes deployed (Commit 9040ba9: scope name change)
2. ✅ Token logging deployed (Commit 5a4519a: scope extraction)
3. ✅ Debug guide created (.planning/debug/SCOPE_DIAGNOSTIC_GUIDE_APRIL9.md)
4. ✅ **NOW: Authoritative matrix created** (Commit 5b646c0)
5. ⏳ Deploy to Vercel (vercel --prod)
6. ⏳ Customer re-login → new tokens with `banking:ai:agent:read`
7. ⏳ Verify token exchange succeeds

---

## Acceptance Criteria — ALL MET ✅

- [x] Single authoritative matrix document created
- [x] All 3 PingOne resources documented with URIs and scopes
- [x] All 4 OAuth applications documented with grants and resources
- [x] Phase 69.1 scope standardization reflected (banking:ai:agent:read, not agent:invoke)
- [x] Legacy/wrong scope names highlighted and clarified
- [x] RFC 8693 token exchange audience binding explained
- [x] Multi-resource scope request pattern documented
- [x] Environment variable reference complete
- [x] Verification checklist with PingOne Console tasks
- [x] Troubleshooting section for "scope not in token" and "invalid_scope"
- [x] PINGONE_APP_SCOPE_MATRIX.md updated to reference new matrix
- [x] Cross-links between docs verified
- [x] Committed to git (5b646c0)
- [x] Ready for deployment

---

## Related Changes (This Session)

**Regression Fix (Commit 9040ba9):**
- Fixed scope validation in oauthUser.js line 48
- Fixed validation logic in agentMcpTokenService.js lines 525-549
- Fixed error modal text in BankingAgent.js

**Token Logging (Commit 5a4519a):**
- Added scope extraction to Token Chain (15 lines)
- Shows actual scopes in token panel on dashboard

**Debug Guide:**
- Created .planning/debug/SCOPE_DIAGNOSTIC_GUIDE_APRIL9.md
- 3-part systematic debugging checklist

---

## What Changed

**Before:** "Where do I check PingOne resources and scopes? They're scattered..."
- PINGONE_APP_SCOPE_MATRIX.md (partial, doesn't show resources)
- SCOPE_AUDIT_REPORT.md (raw scan results)
- config/scopes.js (code — not documentation)
- PINGONE_AUTHORIZE_PLAN.md (partial, focuses on Authorize product)

**After:** "Here's the authoritative matrix showing all resources, apps, and scopes"
- docs/PINGONE_RESOURCES_AND_SCOPES_MATRIX.md (372 lines, comprehensive)
- docs/PINGONE_APP_SCOPE_MATRIX.md (updated with reference)
- Single link to START HERE for all resource/app/scope questions

