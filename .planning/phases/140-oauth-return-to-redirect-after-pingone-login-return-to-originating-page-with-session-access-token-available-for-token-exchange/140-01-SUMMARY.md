# Phase 140 — Plan 01 Summary

**Plan:** Strip ?oauth=success param from URL after login redirect  
**Wave:** 1  
**Status:** COMPLETE  
**Commit:** `facd7d6`

## What was done

### Root cause audit
The `return_to` mechanism was **already fully implemented** in `banking_api_server/routes/oauthUser.js`:
- `sanitizePostLoginReturnPath()` validates same-origin paths
- Login handler stores `req.session.postLoginReturnToPath` from `req.query.return_to`
- Callback redirects to `${origin}${postLoginReturnToPath}?oauth=success`

The only gap was the frontend not cleaning up `?oauth=success` from the URL after the redirect.

### Change made
**`banking_api_ui/src/App.js`** — 12 lines added after the `sso_silent` handler (line ~391):

```js
/** OAuth success landing: strip ?oauth= param from URL — same pattern as sso_silent handler above. */
useEffect(() => {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search || '');
  if (!params.has('oauth')) return;
  params.delete('oauth');
  const newSearch = params.toString();
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '');
  window.history.replaceState(null, '', newUrl);
// eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount only
}, []);
```

### Why it's safe
- The session-retry `useEffect` (lines 303–344) captures `oauthSuccess = params.get('oauth') === 'success'` in its own closure before React runs the cleanup mount effect. No conflict.
- Identical pattern to the existing `sso_silent` cleanup at line ~378.
- `window.history.replaceState` — no page reload, no state loss.

## Acceptance criteria met
- ✅ `params.delete('oauth')` inside one-shot `useEffect` at line 396
- ✅ Session retry logic unchanged (lines 303–344 untouched)
- ✅ `npm run build` exits 0

## Effect
After this change:
- `/pingone-test?oauth=success` → address bar shows `/pingone-test`
- `/mfa-test?oauth=success` → address bar shows `/mfa-test`
- `/dashboard?oauth=success` → address bar shows `/dashboard`
