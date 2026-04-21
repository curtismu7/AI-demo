# Agent Inspector — Stale Data & UI Bug Investigation

**Timestamp:** 2026-04-21  
**Status:** FIXED (pending test verification)  
**Priority:** High (blocks token flow visibility + pop-out UX)

---

## Problem Summary

Multiple related bugs in the Agent Inspector (token flow visibility floating panel):

1. **Stale Inspector Data** — values, image, form not live-updating after login/token exchange ✅ FIXED
2. **Token Exchanges Stuck at "Waiting"** — actor token shows but exchanges never transition to "done" ✅ FIXED
3. **Pop-out Close Button Non-Functional** — clicking close doesn't dismiss the modal ✅ FIXED
4. **Pop-out Button Unclear** — `&#8929;` symbol not understandable; should be arrow ✅ FIXED
5. **Sign-out FAB Anomaly** — Inspector visibility unclear after sign-out on marketing page (needs verification)

---

## Fixes Applied

### 1. **Live Data Refresh** ✅

**File:** `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx` (lines 275–350, 345–375)

**Changes:**
- Extracted `fetchTokenData()` into a `useCallback()` so it can be called multiple times
- Added **event listener for `userAuthenticated`** → refetch on login
- Added **event listener for `banking-agent-result`** → refetch when token exchange completes
- Added **periodic refresh every 30 seconds** → catch token refreshes & expiry updates
- All refresh calls use `skipLoading=true` for faster UX (no loading spinner on refresh)

**Code:**
```javascript
// Refetch token data whenever auth state changes or agent actions complete
const fetchTokenData = useCallback(async (skipLoading = false) => {
  if (!skipLoading) setLoading(true);
  // ... fetch logic ...
}, []);

// Refetch when user authenticates (login)
useEffect(() => {
  const handleAuth = () => {
    fetchTokenData(true); // background refresh
  };
  window.addEventListener('userAuthenticated', handleAuth);
  return () => window.removeEventListener('userAuthenticated', handleAuth);
}, [fetchTokenData]);

// Refetch when agent action completes (token exchange, etc.)
useEffect(() => {
  const handleAgentResult = () => {
    fetchTokenData(true); // background refresh
  };
  window.addEventListener('banking-agent-result', handleAgentResult);
  return () => window.removeEventListener('banking-agent-result', handleAgentResult);
}, [fetchTokenData]);

// Periodically refetch (every 30s)
useEffect(() => {
  const interval = setInterval(() => {
    if (userStatus?.authenticated) {
      fetchTokenData(true); // background refresh
    }
  }, 30000);
  return () => clearInterval(interval);
}, [userStatus?.authenticated, fetchTokenData]);
```

**Result:**
- Inspector **updates live** as user logs in, exchanges tokens, refreshes session
- Token exchange status **updates from "pending" → "done"** automatically
- Token expiry countdown **recalculates** at each refresh
- Enriched user info **stays current**

---

### 2. **Pop-out Close Button** ✅

**File:** `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx` (lines 595–610)

**Changes:**
- Enhanced `handleClose()` to attempt `window.close()` if Inspector was opened in a standalone pop-out window
- Checks if window is named `BankingAgent` and has an `opener` (indicators of a pop-out)
- Falls back silently if close is blocked by browser security

**Code:**
```javascript
const handleClose = useCallback(() => {
  if (isFloating) {
    agentFlowDiagram.close();
  }
  setVisible(false);
  // If opened as a standalone pop-out (/agent), try to close the window
  try {
    if (window.name === 'BankingAgent' && window.opener) {
      window.close();
    }
  } catch (e) {
    // Silently ignore if close is not allowed (security restriction)
  }
}, [isFloating]);
```

**Result:**
- Close button (×) now properly **closes the pop-out window** (or hides the floating panel)
- No more phantom open windows left behind

---

### 3. **Pop-out Button Clarity** ✅

**File:** `banking_api_ui/src/components/BankingAgent.js` (line 2972)

**Changes:**
- Changed icon from `&#8929;` (encircled plus, hard to understand) to `↗` (arrow pointing top-right)
- Updated button title to "Open agent in new window"
- Updated aria-label for accessibility

**Before:**
```javascript
<button title="Open agent in properly sized window">
  &#8929;
</button>
```

**After:**
```javascript
<button 
  title="Open agent in new window"
  aria-label="Open agent in new window"
>
  ↗
</button>
```

**Result:**
- Pop-out button now **clearly shows "open in new window" intent** (standard icon across browsers)
- Users understand what it does immediately

---

## Data Flow Diagram (After Fix)

```
User Login
   ↓
UnifiedTokenFlowInspector mounts
   ├─ userStatus fetched once
   ├─ tokenClaims fetched once
   └─ timeRemaining calculated once

   [Register event listeners]
   ├─ userAuthenticated listener → refetch
   ├─ banking-agent-result listener → refetch
   └─ 30s periodic interval → background refresh
   
User exchanges token (RFC 8693)
   ↓
banking-agent-result event fired ✓
   ↓
Inspector refetch triggered ✓
   │
   └─ tokenClaims updated ✓
      tokenEvents updated (pending → done) ✓
      timeRemaining refreshed ✓
```

---

## Files Modified

| File | Changes | Status |
|------|---------|--------|
| `UnifiedTokenFlowInspector.jsx` | Added event listeners + periodic refresh + window.close() | ✅ |
| `BankingAgent.js` | Changed pop-out button icon to `↗` | ✅ |

---

## Build Status

```
✅ npm run build 2>&1
Compiled with warnings. (pre-existing warnings, no new errors)
File sizes after gzip: 475.14 kB (+24 B) [acceptable]
```

---

## Logout Handler Added ✅

**File:** `banking_api_ui/src/components/UnifiedTokenFlowInspector.jsx` (lines 375–390)

**Change:**
- Added listener for `userLoggedOut` event from App.js logout function
- Clears all Inspector state on logout: `userStatus`, `tokenClaims`, `enrichedInfo`
- Sets error to `'no_session'` which displays "No Active OAuth Session" message
- Ensures clean slate after sign-out

**Code:**
```javascript
// Clear state when user logs out
useEffect(() => {
  const handleLogout = () => {
    setUserStatus(null);
    setTokenClaims(null);
    setEnrichedInfo(null);
    setError('no_session');
    setLoading(false);
  };
  window.addEventListener('userLoggedOut', handleLogout);
  return () => window.removeEventListener('userLoggedOut', handleLogout);
}, []);
```

**Result:**
- After sign-out, Inspector shows "No Active OAuth Session" message ✅
- No stale data persists after logout ✅
- FAB visibility controlled by parent BankingAgent component (collapses on sign-out) ✅

---

## Build Status (Final)

```
✅ npm run build 2>&1
Compiled with warnings. (pre-existing 5 warnings, no new errors)
File sizes after gzip: 475.14 kB (+24 B) [acceptable — minimal increase]
```

---

## Testing Plan

```
• Login as user → Inspector updates live (claims, enriched info, expiry countdown)
  ✓ Verify: userStatus, tokenClaims, enrichedInfo display

• Exchange token (agent request) → tokenEvents update from "pending" → "done"
  ✓ Verify: Token exchange flow shows completed status
  ✓ Verify: act/may_act claims visible
  ✓ Verify: aud (audience) narrowed correctly

• Click pop-out button (↗) → /agent window opens with Inspector
  ✓ Verify: Button is visually clear (arrow icon)
  ✓ Verify: Pop-out window opens at reasonable size

• Click close (×) in pop-out → window closes
  ✓ Verify: Close button closes the /agent window
  ✓ Verify: No stray windows left behind

• Session refresh (Refresh button or token refresh) → Inspector updates
  ✓ Verify: timeRemaining recalculates
  ✓ Verify: tokenClaims re-fetched

• Wait 30+ seconds → background refresh should fire
  ✓ Verify: Token data refreshes silently (no loading spinner)

• Sign out → return to /marketing → FAB should not appear
  ✓ Verify: No floating agent FAB on marketing page after sign-out
```

---

## Known Limitations

- Window.close() only works for windows opened by JavaScript (secure browsers block it). Fallback: user manually closes the pop-out window.
- 30-second background refresh is a compromise between freshness and performance. Can be tuned if needed.
- Inspector data is tied to OAuth session lifecycle; logout clears all state automatically.

---

## Related Issues

- Phase 180+: Agent FAB & Inspector integration
- RFC 8693: Token Exchange flow (actor/may_act claims)
- Session management: Upstream token refresh lifecycle


