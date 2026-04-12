---
debug_session_id: debug-react-setstate-20260409
created: 2026-04-09
status: investigating
component: BankingAgent.js
error_type: setState-during-render
---

# Debug: React setState-in-render Warning — BankingAgent

## Symptoms

**Error Message:**
```
Warning: Cannot update a component (`BankingAgent`) while rendering a different component (`BankingAgent`). 
To locate the bad setState() call inside `BankingAgent`, follow the stack trace...
```

**Stack Trace Origin:**
- App.js:92
- BankingAgent (line 8961 in bundle)
- Embedded within EmbeddedAgentDock → LandingPage

**Phase Context:**
- Error likely introduced in Phase 116-03 (UI wiring to agent endpoint)
- BankingAgent.js modified to use `sendAgentMessage()` instead of `parseNaturalLanguage()`
- HITL 428 consent logic added

**Behavior:**
- Warning appears in browser console (React dev mode)
- User needs to clarify:
  - Triggers (on page load? after user action?)
  - Consistency (every time or intermittent?)
  - Functionality impact (app works or broken?)

## Investigation Goals

1. **Find setState call in render path**
   - Search BankingAgent.js for setState outside useEffect/event handlers
   - Check handleNaturalLanguage() function for async issues
   - Verify HITL consent logic doesn't update state during render

2. **Identify root cause pattern**
   - State update queued during render cycle
   - Multiple setState calls competing
   - Effect hook with side effects that trigger re-render

3. **Locate exact line**
   - Convert bundle line (8961) to source line in BankingAgent.js
   - Narrow to specific function (likely handleNaturalLanguage, setHitlPendingIntent, or append token logic)

4. **Propose fix**
   - Move setState into proper effect hook
   - Wrap async operations correctly
   - Use callback refs if needed

## Files to Investigate

- [banking_api_ui/src/components/BankingAgent.js](../banking_api_ui/src/components/BankingAgent.js) — Primary suspect
  - handleNaturalLanguage() function (replaced in 116-03)
  - setHitlPendingIntent() calls (added in 116-03)
  - appendTokenEvents() calls (new pattern)
  - Chip quick-action handlers (updated in 116-03)

- [banking_api_ui/src/services/bankingAgentService.js](../banking_api_ui/src/services/bankingAgentService.js)
  - sendAgentMessage() implementation (new in 116-03)
  - Check for unexpected state updates

## Root Cause Hypothesis

Most likely:
- `handleNaturalLanguage()` or HITL consent resume logic calling setState synchronously during render
- State update triggered by Phase 116-03 wiring (sendAgentMessage flow)
- Expected: setState in useEffect or event handler; Actual: setState in render body/function call chain

## Next Steps

1. Examine BankingAgent.js line ranges around state updates
2. Check all setState/dispatch calls in handleNaturalLanguage()
3. Verify HITL logic (428 detection → setHitlPendingIntent) respects React rules
4. Look for race conditions between appendTokenEvents and render
5. Check if sendAgentMessage callback is updating state incorrectly

---

**Ready for: Code inspection of BankingAgent.js render path and state management patterns**

---

## RESOLUTION

### Root Cause

**Location:** [BankingAgent.js line 863-865](../../banking_api_ui/src/components/BankingAgent.js#L863)

**Problem:** 
```javascript
const [consentBlocked, setConsentBlocked] = useState(() => {
  setAgentBlockedByConsentDecline(false);  // ❌ setState during render phase
  return false;
});
```

React warning firing because `useState` initializer runs during render phase, not safe for side effects. Calling `setAgentBlockedByConsentDecline()` (parent setState) violates React rule: "Cannot update a component while rendering another component."

### Fix Applied

**Commit:** 5e2e4b3

**Changes:**
1. Line 863: Simplified `useState` initializer
   - Before: `useState(() => { setAgentBlockedByConsentDecline(false); return false; })`
   - After: `useState(false)`

2. Lines 909-911: Added proper `useEffect` for side effect
   ```javascript
   useEffect(() => {
     setAgentBlockedByConsentDecline(false);
   }, [setAgentBlockedByConsentDecline]);
   ```

**Why this works:**
- `useEffect` runs AFTER render phase completes (correct place for side effects)
- Dependency on `setAgentBlockedByConsentDecline` ensures it runs when parent function changes
- Component initializes with `false`; parent state cleared after mount

### Verification

✅ **Build:** `npm run build` exits 0
✅ **No errors:** No console errors/warnings
✅ **Committed:** Git hash 5e2e4b3

### Impact

Eliminates React warning while preserving functionality:
- Component still clears consent decline on mount
- Parent state properly synchronized
- Follows React best practices (pure init, effects for side effects)

### Status

**RESOLVED** ✅
