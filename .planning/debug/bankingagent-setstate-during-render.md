---
issue_slug: bankingagent-setstate-during-render
status: investigating
created: 2026-04-08
---

# Debug: BankingAgent setState During Render Warning

## Symptoms

**Expected behavior:**
- BankingAgent component renders without React warnings
- Agent initializes without state update conflicts
- Audit endpoint calls succeed with proper auth

**Actual behavior:**
- React warning: "Cannot update a component (BankingAgent) while rendering a different component (BankingAgent)"
- 401 error on `api/pingone/audit` endpoint
- Warning originates from BankingAgent component

**Error Messages:**
```
App.js:86 Warning: Cannot update a component (`BankingAgent`) while rendering a different component (`BankingAgent`). 
To locate the bad setState() call inside `BankingAgent`, follow the stack trace as described in https://reactjs.org/link/setstate-in-render
```

```
api/pingone/audit:1  Failed to load resource: the server responded with a status of 401 (Unauthorized)
```

**Stack Trace Context:**
- BankingAgent (line 8523)
- TokenChainProvider
- EducationUIProvider
- DemoTourProvider
- AppWithAuth

**Timeline:**
- Observed on production (api.pingdemo.com:4000)
- Appears to be triggered on initial app load or auth state change

**Reproduction:**
1. Load app with valid session
2. BankingAgent initializes
3. Warning appears in console
4. Audit endpoint 401 error concurrent

## Investigation Progress

### Hypotheses to Test
1. [ ] `useEffect` in BankingAgent calling setState without proper dependencies
2. [ ] Audit endpoint fetch triggered during render (not in useEffect)
3. [ ] Auth state change during component initialization
4. [ ] TokenChainProvider or parent causing state cascade
5. [ ] Session/token validity issue triggering re-auth flow during render

### Areas to Check
- [BankingAgent.js](../../../../banking_api_ui/src/components/BankingAgent.js) - render logic and hooks
- Audit service call patterns
- useEffect dependency arrays
- Parent provider initialization order
- 401 error handling in auth middleware

### Findings
(To be filled in)

## Solution
(To be determined)
