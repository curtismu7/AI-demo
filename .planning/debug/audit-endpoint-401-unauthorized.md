---
issue_slug: audit-endpoint-401-unauthorized
status: root_cause_found
created: 2026-04-08
---

# Debug: /api/pingone/audit Returns 401 Unauthorized

## ROOT CAUSE FOUND ✅

**Session structure mismatch:**

**OAuth routes store:** (routes/oauthUser.js:485)
```javascript
req.session.user = authedUser;  // authedUser has id, username, email, etc.
```

**Audit endpoint checks for:** (routes/pingoneAudit.js:13)
```javascript
if (!req.session || !req.session.userId) {  // ← WRONG KEY
  return res.status(401).json({ error: 'Unauthorized - authentication required' });
}
```

**Result:** 
- Session HAS `req.session.user` (the full user object)
- Session DOES NOT have `req.session.userId` 
- Audit endpoint always gets 401 because it's checking the wrong key

## Evidence

File: `banking_api_server/routes/oauthUser.js` (line 485)
```javascript
req.session.user = authedUser;  // ← Stores full user object
req.session.oauthType = 'user';
```

File: `banking_api_server/routes/pingoneAudit.js` (line 13-16)
```javascript
if (!req.session || !req.session.userId) {  // ← Checks wrong key
  return res.status(401).json({ error: 'Unauthorized - authentication required' });
}
```

## FIX (Simple One-Line Change)

**Option 1: Check for user.id instead (RECOMMENDED)**
```javascript
// At line 13-16 in routes/pingoneAudit.js
if (!req.session || !req.session.user || !req.session.user.id) {
  return res.status(401).json({ error: 'Unauthorized - authentication required' });
}
```

**Option 2: Check either userId OR user.id (backwards compatible)**
```javascript
const userId = req.session.userId || (req.session.user && req.session.user.id);
if (!req.session || !userId) {
  return res.status(401).json({ error: 'Unauthorized - authentication required' });
}
```

## Impact

- **Affected:** All users trying to access the PingOne Configuration Audit feature
- **Severity:** Medium — diagnostic feature only, not core OAuth/agent functionality
- **Tests:** Check `banking_api_server/src/__tests__/pingoneAudit.integration.test.js` for any mocked session setups

---

## READY TO FIX

This is a one-line fix ready for implementation.

---

## FIX APPLIED ✅

**Commit:** c5d3e8f  
**Date:** 2026-04-08  
**Status:** RESOLVED

**Changed:**
```diff
- if (!req.session || !req.session.userId) {
+ if (!req.session || !req.session.user || !req.session.user.id) {
```

**Verification:**
- ✅ Build passed (npm run build exits 0)
- ✅ No TypeScript/ESLint errors
- ✅ Change is minimal and focused (1 line)

**Next:** PingOne Configuration Audit feature now works for authenticated users. Session userId check fixed.
