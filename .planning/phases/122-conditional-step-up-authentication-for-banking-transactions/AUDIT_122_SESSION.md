# Phase 122 Session Check Audit

**Date:** 2026-04-10
**Auditor:** Cascade AI
**Scope:** Current authentication flow for POST /api/transactions

## Current Flow

1. **Route Protection:** POST /api/transactions uses `authenticateToken` middleware (line 255 in transactions.js)
2. **Token Validation:** `authenticateToken` (auth.js lines 548-607) validates Bearer token or falls back to session token from `req.session?.oauthTokens?.accessToken`
3. **Step-up MFA Gate:** Located at lines 364-408 in transactions.js, runs after `authenticateToken` succeeds
4. **Session Middleware:** `requireSession` function exists (auth.js lines 945-953) but is NOT used on POST /api/transactions

## Key Findings

### Session Check Status
- **NO explicit session check before step-up MFA gate**
- The route relies on `authenticateToken` to populate `req.user`
- If `authenticateToken` succeeds (via Bearer token or session token), the step-up gate runs regardless of whether the user has an active browser session

### Current Behavior
- Non-logged-in users attempting banking actions: `authenticateToken` will fail (no token, no session token) → 401 error
- Logged-in users below threshold: Step-up gate bypassed → transaction proceeds
- Logged-in users above threshold: Step-up gate returns 428 → MFA required

### Gap Identified
The current implementation does NOT distinguish between:
- User with valid Bearer token but no browser session (e.g., API client)
- User with valid browser session (logged in via UI)

Both paths use the same step-up MFA logic. For the Phase 122 objective (logged-in users only require MFA for high-value transactions, non-logged-in users require both login AND MFA), this gap means:
- A user with a valid token but no session would only get MFA prompt, not login prompt
- The UI messaging wouldn't distinguish between "you need to sign in" vs "you need to complete MFA"

## Insertion Point for Conditional Logic

**Recommended location:** Before the step-up MFA gate (line 364 in transactions.js)

**Logic:**
```javascript
// Add before line 364 (before step-up MFA gate)
if (!req.session?.user) {
  return res.status(401).json({
    error: 'unauthenticated',
    error_description: 'Login required. Please sign in to perform banking operations.',
    login_url: '/sign-in'
  });
}
```

This ensures:
1. Session is checked before step-up MFA logic
2. Non-logged-in users get 401 with login prompt
3. Logged-in users proceed to existing step-up MFA gate
4. No regression in existing step-up threshold logic

## Middleware Usage Decision

**Recommendation:** Use inline session check (not requireSession middleware)

**Rationale:**
- Inline check allows custom error response with `login_url` field
- `requireSession` middleware returns generic 401 without login_url
- Inline check provides better context for UI to redirect appropriately
- Minimal code change, easier to test and verify

## Files Modified

- `banking_api_server/routes/transactions.js` - Add session check before line 364
- `banking_api_ui/src/components/BankingAgent.js` - Handle 401 responses with login prompt
- `banking_api_ui/src/components/UserDashboard.js` - Add session checks on banking action buttons

## Next Steps

1. Implement session check in transactions.js (Task 2)
2. Update BankingAgent.js to handle 401 responses (Task 3)
3. Add session checks to UserDashboard.js (Task 4)
4. Test end-to-end flows (Task 6)
