# CLARIFICATION: Token Chain Scope Injection Tracking

**User Request:** Ensure token chain shows injected vs real scopes with clarity.

**Current Status:** Plan 02 Task 2 and Plan 03 Task 1 need Enhancement

---

## Enhanced Approach for Tracking Injected Scopes

### Problem with Original Plan 02 Task 2

Original approach added `injected: true` only to the tokenEvent object, making it impossible to distinguish which **specific scopes** were injected when displaying the token.

**Original code (insufficient):**
```javascript
claims.scope = (claims.scope || '') + ' ' + injectScopes.join(' ');  // ← All scopes merged
tokenEvents.push({
  injected: true  // ← Marks the event, not individual scopes
});
```

**Result in UI:** Can't tell if `banking:read` or `banking:write` were injected or real.

---

## UPDATED Plan 02 Task 2 — Proper Scope Tracking

### Enhanced Injection Function

```javascript
/**
 * Inject banking scopes and track which ones were injected.
 * 
 * **CRITICAL:** This tracks injected scope NAMES so UI can display per-scope badges.
 * 
 * @param {object} claims — decoded JWT claims
 * @param {Array} tokenEvents — accumulator
 * @returns {object} modified claims
 */
function conditionalInjectBankingScopes(claims, tokenEvents) {
  if (!claims || claims.scope == null) {
    return { claims, injectedScopeNames: [] };
  }

  const existingScopes = String(claims.scope).trim().split(/\s+/).filter(Boolean);
  const hasBankingScopes = existingScopes.some(
    s => s.startsWith('banking:') || s === 'banking:read' || s === 'banking:write'
  );

  if (hasBankingScopes) {
    return { claims, injectedScopeNames: [] };  // No injection needed
  }

  const shouldInjectScopes =
    configStore.getEffective('ff_inject_scopes') === true ||
    configStore.getEffective('ff_inject_scopes') === 'true';

  if (!shouldInjectScopes) {
    return { claims, injectedScopeNames: [] };
  }

  // **KEY CHANGE:** Track which exact scope names are being injected
  const injectScopeNames = ['banking:read', 'banking:write'];
  
  // Add injected scopes to claims.scope
  claims.scope = (claims.scope || '') + ' ' + injectScopeNames.join(' ');
  
  // **CRITICAL:** Store list of injected scope names in claims for UI tracking
  // This allows Plan 03 to display badges per-scope, not blanket injection flag
  claims.injected_scope_names = injectScopeNames;  // ← NEW: scope-level tracking
  
  // Log the injection event
  tokenEvents.push({
    timestamp: new Date().toISOString(),
    phase: 'Token Claim Injection',
    label: '[BFF-INJECTED scope]',
    detail: `Scopes synthetically injected: ${injectScopeNames.join(', ')}. ` +
            `ff_inject_scopes = true (demo mode). ` +
            `User token had no banking scopes; application added them for functionality.`,
    injected: true,
    injectedScopeNames: injectScopeNames,  // ← NEW: Include list in event
  });

  warnLog(
    `[SCOPE_INJECTION] Injected: ${injectScopeNames.join(', ')}. ` +
    `User token had no banking scopes. ff_inject_scopes enabled (demo mode).`
  );

  return { claims, injectedScopeNames: injectScopeNames };  // ← Return for wiring
}
```

---

## UPDATED Plan 03 Task 1 — Per-Scope Badge Display

### Enhanced Token Chain Display Logic

```jsx
// In TokenChainDisplay.js

/**
 * Display individual scope badges with INJECTED markers for demonstration.
 * 
 * @param {Array} scopes — space-separated scopes from token.claims.scope
 * @param {Array} injectedScopeNames — list of scope names marked as injected (from Plan 02)
 */
const ScopeList = ({ scopes, injectedScopeNames = [] }) => {
  if (!scopes) return <span>None</span>;

  const scopeArray = String(scopes).trim().split(/\s+/).filter(Boolean);
  
  return (
    <div className="scope-list">
      {scopeArray.map((scope, idx) => {
        // **KEY:** Check if THIS SPECIFIC SCOPE was injected
        const isInjected = injectedScopeNames.includes(scope);
        
        return (
          <span 
            key={idx} 
            className={isInjected ? "scope-badge scope-badge--injected" : "scope-badge scope-badge--real"}
            title={isInjected ? "Added by application (demo mode), not from PingOne" : "Issued by PingOne"}
          >
            {scope}
            {isInjected && <span className="injected-marker">⚡ INJECTED</span>}
          </span>
        );
      })}
    </div>
  );
};
```

### CSS Styling

```css
.scope-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0;
}

.scope-badge {
  display: inline-block;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

/* Real scopes (from PingOne) */
.scope-badge--real {
  background-color: #e8f4f8;
  color: #004085;
  border: 1px solid #0c5460;
}

/* Injected scopes (demo mode) */
.scope-badge--injected {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffc107;
}

.injected-marker {
  margin-left: 6px;
  font-weight: bold;
  font-size: 11px;
}

.injected-marker::before {
  content: "⚡ ";
}
```

### Integration in Token Display

```jsx
// In the token claims rendering:

<div className="token-claims-section">
  <h4>Scopes</h4>
  <ScopeList 
    scopes={decodedToken.claims.scope}
    injectedScopeNames={decodedToken.claims.injected_scope_names || []}
  />
</div>
```

---

## Data Flow: How Injected Scopes Are Tracked

```
Plan 02 Task 2 (BFF Token Resolution)
├─ Check token for banking scopes
├─ If missing AND ff_inject_scopes enabled:
│  ├─ Add banking:read, banking:write to claims.scope
│  └─ **CRITICAL:** Set claims.injected_scope_names = ['banking:read', 'banking:write']
└─ Include both in token response

Plan 03 Task 1 (Client UI Display)
├─ Receive token with claims.injected_scope_names array
├─ Render scope list
├─ For EACH scope:
│  ├─ Check if scope is in injected_scope_names array
│  ├─ If YES: Display with INJECTED badge (yellow/gold)
│  └─ If NO: Display as real scope (blue)
└─ Result: User sees clear visual distinction
```

---

## Verification Checklist

- ✅ Plan 02 Task 2: `claims.injected_scope_names` set to injected scope list
- ✅ Plan 02 Task 2: `tokenEvents` includes `injectedScopeNames` for audit trail
- ✅ Plan 03 Task 1: ScopeList component checks each scope against injectedScopeNames
- ✅ Plan 03 Task 1: INJECTED badge only on scopes in injectedScopeNames array
- ✅ CSS: Real scopes (blue), Injected scopes (yellow/gold), clearly distinct
- ✅ UI: User can see at a glance which scopes are from PingOne vs demo injection
- ✅ Tooltip: Hover text explains "Added by application (demo mode)"

---

## Summary

**Original Issue:** Token chain couldn't distinguish injected vs real scopes.

**Solution:** 
1. Store list of injected scope names in JWT claims (`injected_scope_names` array)
2. Track in tokenEvents for audit trail
3. UI checks each individual scope against this list
4. Display per-scope INJECTED badges with different styling

**Result:** Users see clear, granular indication of which scopes are injected (yellow/gold with ⚡ marker) vs real from PingOne (blue).

This approach maintains transparency per D-04 while being specific enough for learners to understand the difference.
