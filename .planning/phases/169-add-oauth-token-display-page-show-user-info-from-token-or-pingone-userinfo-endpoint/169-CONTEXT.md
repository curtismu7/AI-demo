# Phase 169: Add OAuth Token Display Page — Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Source:** User vision captured from `/gsd-add-phase` discussion

---

<domain>

## Phase Boundary

Create a dedicated OAuth token display page to serve as a final endpoint for the OAuth flow. After authentication completes, users are redirected to this page which displays their token information.

**Two implementation options (TBD during planning):**
- **Option A:** Extract and display user info directly from the JWT token claims (faster, less latency)
- **Option B:** Call PingOne userinfo endpoint to fetch additional/enriched user profile data (more complete, but adds extra API call)

The page serves both as a visual confirmation of successful authentication and as an educational tool showing what information PingOne provides in the OAuth flow.

</domain>

---

<decisions>

## Locked Decisions

### D-01: Purpose & Intent
- This page is the **final destination** after OAuth login flow completes
- Shows **proof of authentication** by displaying the user's token information
- Educational value: demonstrate OAuth token structure and PingOne user attributes

### D-02: Information Source (Placeholder — TBD in Planning)
- Either parse JWT claims from the token OR call PingOne userinfo endpoint
- Planning task will determine: performance vs. completeness tradeoff
- Token info must be clearly labeled (easy to understand what comes from JWT vs. API call)

### D-03: Data Display Format
- Clean, readable layout showing key token claims
- Group related information (identity, scopes, expiry, organization/environment)
- Use existing UI patterns from the app (similar to ActorTokenEducation or PingOneTestPage layouts)

### D-04: Integration Point
- Reachable from OAuth callback redirect (after successful authentication)
- Also accessible from main dashboard/navigation for review
- Admin-accessible endpoint (user-visible, restricted to authenticated sessions)

### D-05: Session Handling
- Require valid user session to view (OAuth callback provides this)
- Display current user's token and profile (not editable)
- Gracefully handle expired or missing tokens (error state)

---

## the Agent's Discretion

- **Route path:** Where should this page live? (/oauth/token-display, /dashboard/token-info, etc.)
- **Navigation:** Should there be a link in top nav, sidebar, or just accessible after login flow?
- **Error handling:** How to handle cases where token is expired, revoked, or missing
- **Refresh button:** Should user be able to refresh PingOne userinfo data, or read-only?
- **Copy-to-clipboard:** For token claims or endpoints (QA/debugging convenience)

</decisions>

---

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### OAuth & Token Handling
- [CLAUDE.md](../../../../CLAUDE.md) — Project-wide standards and regression plan
- [REGRESSION_PLAN.md](../../../../REGRESSION_PLAN.md) — Critical files checklist; § 1 for protected areas
- [.github/skills/oauth-pingone/SKILL.md](.github/skills/oauth-pingone/SKILL.md) — PingOne OAuth, token validation, JWT parsing

### PingOne API Patterns
- [.github/skills/pingone-api-calls/SKILL.md](.github/skills/pingone-api-calls/SKILL.md) — How to call PingOne Management API for userinfo endpoint
- [.github/skills/vercel-banking/SKILL.md](.github/skills/vercel-banking/SKILL.md) — Session management and token persistence patterns

### UI & Component Reference  
- [banking_api_ui/src/pages/PingOneTestPage.tsx](banking_api_ui/src/pages/PingOneTestPage.tsx) — Similar admin UI pattern showing token/endpoint info
- [banking_api_ui/src/components/ActorTokenEducation.tsx](banking_api_ui/src/components/ActorTokenEducation.tsx) — Educational token visualization pattern

### Related Phases
- Phase 167: Show tools in MCP server — education pattern reference
- Phase 168: HTTP2 stream support — may affect how/where token info is fetched

</canonical_refs>

---

<specifics>

## Specific Ideas from Vision

- **Final step payload:** OAuth flow delivers the user here after successful token exchange
- **Token format:** Display structured JWT claims (not raw token string unless for copy)
- **User info:** At minimum: username, email, subject (sub), issuer, audience, token expiry
- **Enrichment option:** Call PingOne `/me` or `/userinfo` endpoint for first_name, last_name, phone, organization, environment, etc.
- **Use case:** Demo endpoint showing full OAuth circle for onboarding/education; also QA checkpoint

</specifics>

---

<deferred>

## Deferred Ideas

- (None identified — phase scope is clear and contained)

</deferred>

---

*Phase 169: Add OAuth token display page*  
*Context created: 2026-04-16 from user's /gsd-add-phase request*
