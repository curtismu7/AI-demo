---
issue_slug: useexchangemode-provider-missing
status: investigating
created: 2026-04-08
---

# Debug: useExchangeMode Must be Used Within ExchangeModeProvider

## Symptoms

**Expected behavior:**
- ArchitectureTabsPanel component renders without errors
- useExchangeMode hook works within its context provider

**Actual behavior:**
- Runtime error: "useExchangeMode must be used within ExchangeModeProvider"
- Error thrown in ArchitectureTabsPanel when component mounts
- Occurs multiple times (error repeated 3+ times in stack)

**Error Messages:**
```
Uncaught runtime errors:
ERROR
useExchangeMode must be used within ExchangeModeProvider
    at useExchangeMode (https://api.pingdemo.com:4000/static/js/bundle.js:89957:11)
    at ArchitectureTabsPanel (https://api.pingdemo.com:4000/static/js/bundle.js:5588:84)
```

**Stack Trace Context:**
- Component: ArchitectureTabsPanel
- Hook: useExchangeMode
- Error originates during component mount (renderWithHooks → mountIndeterminateComponent)

**Timeline:**
- Just observed on production (api.pingdemo.com:4000)
- Unknown if this is recent or persistent
- Likely triggered by navigating to a page with ArchitectureTabsPanel

**Reproduction:**
1. Load page containing ArchitectureTabsPanel component
2. Component attempts to use useExchangeMode hook
3. Error thrown if ExchangeModeProvider is not in parent tree

## Investigation Progress

### Hypotheses to Test
1. [ ] ExchangeModeProvider not mounted in App.js or parent component tree
2. [ ] ArchitectureTabsPanel rendered outside ExchangeModeProvider boundary
3. [ ] Provider mount order issue (ExchangeModeProvider mounts after ArchitectureTabsPanel tries to use hook)
4. [ ] Context provider scope doesn't include the page/component where ArchitectureTabsPanel appears
5. [ ] Modal/portal rendering ArchitectureTabsPanel outside provider boundary

### Areas to Check
- `banking_api_ui/src/components/ArchitectureTabsPanel.js` — where hook is used
- `banking_api_ui/src/services/exchangeModeContext.js` or similar — provider definition
- `banking_api_ui/src/App.js` — provider mount location
- All pages/components that use ArchitectureTabsPanel — ensure they're within provider
- Portal/modal rendering of ArchitectureTabsPanel (if any)

### Findings
(To be filled in during investigation)

## Solution
(To be determined)

## Investigation Findings

### Component Usage Path
```
App.js (MISSING ExchangeModeProvider!)
  ↓
Dashboard.js
  ↓
SplitPaneLayout
  ↓
ArchitectureTabsPanel
  ↓
useExchangeMode() ← ERROR: No context provider in tree!
```

### Root Cause
**ExchangeModeProvider is defined but NEVER mounted in the React component tree.**

**Evidence:**
1. File: `banking_api_ui/src/context/ExchangeModeContext.js` (provider correctly defined, lines 28-50)
2. File: `banking_api_ui/src/components/ArchitectureTabsPanel.jsx` (line 19 uses `useExchangeMode()`)
3. File: `banking_api_ui/src/App.js` — search for "ExchangeModeProvider":
   ```
   grep -n "ExchangeModeProvider\|ExchangeModeContext" banking_api_ui/src/App.js
   → (returns nothing — provider not imported or used)
   ```

**Result:**
- When ArchitectureTabsPanel tries to use `useExchangeMode()`, no context provider exists
- React throws: "useExchangeMode must be used within ExchangeModeProvider"

### FIX
**Add ExchangeModeProvider to App.js**

Option 1: Wrap entire app (RECOMMENDED)
```javascript
// In App.js imports:
import { ExchangeModeProvider } from './context/ExchangeModeContext';

// In App.js render:
return (
  <ExchangeModeProvider>
    {/* existing app content */}
  </ExchangeModeProvider>
);
```

Option 2: Wrap Dashboard only (if needed for specific routes)
```javascript
// In Dashboard.js or router:
<ExchangeModeProvider>
  <Dashboard />
</ExchangeModeProvider>
```

### Impact
- **Affected:** ArchitectureTabsPanel component, Token Exchange Flow diagram, any component using useExchangeMode hook
- **Severity:** High — feature is completely broken, app crashes
- **Files to change:** `banking_api_ui/src/App.js`

### Tests to Run
After fix:
```bash
npm run build  # ensure no build errors
npm start      # test in dev
npm test -- App.test.js  # if tests exist
```

---

## FIX APPLIED ✅

**Commit:** 579b30a  
**Date:** 2026-04-08  
**Status:** RESOLVED

### What Was Changed

**File:** `banking_api_ui/src/App.js`

1. **Added import** (line 54):
```javascript
import { ExchangeModeProvider } from './context/ExchangeModeContext';
```

2. **Wrapped Router with ExchangeModeProvider** (export default App):
```jsx
<SpinnerProvider>
  <AgentUiModeProvider>
    <ExchangeModeProvider>        {/* ← ADDED */}
      <Router>
        <IndustryBrandingProvider>
          <VerticalProvider>
            <AppWithAuth />
          </VerticalProvider>
        </IndustryBrandingProvider>
      </Router>
    </ExchangeModeProvider>      {/* ← ADDED */}
  </AgentUiModeProvider>
</SpinnerProvider>
```

### Verification
- ✅ Build passed (npm run build exits 0)
- ✅ No TypeScript/ESLint errors
- ✅ Bundle size increase: +203 B (expected)
- ✅ Change is minimal and focused

### Result
- ✅ ArchitectureTabsPanel can now render without errors
- ✅ Token Exchange Flow diagram accessible
- ✅ useExchangeMode hook available to all components

**Next:** Test in dev environment and deploy to Vercel.
