---
issue_slug: transaction-buttons-and-mfa-flow-bugs
status: investigating
created: 2026-04-08
priority: 🔴 CRITICAL
---

# Debug Session: Transaction Buttons & MFA Flow Issues

## Issue Summary

**Trigger**: Banking transaction buttons (Deposit, Transfer, Withdraw) have inconsistent behavior; high-value transaction MFA flow broken; no MFA device enrollment UI.

---

## Symptoms (Gathered)

### 1. Transaction Persistence Bug

**Expected behavior:**
- Clicking Deposit, Transfer, or Withdraw should:
  1. Process the transaction
  2. Update "recent transactions" list
  3. Persist transaction to storage
  4. Allow retrieval after page refresh

**Actual behavior:**
- ✅ **Deposit**: Works correctly (transactions update and persist)
- ❌ **Transfer**: No transaction update or persistence
- ❌ **Withdraw**: No transaction update or persistence

**Reproduction:**
1. Open dashboard
2. Click "Withdraw" or "Transfer" on account
3. Enter amount and description
4. Click "Withdraw" or "Transfer" button
5. Check "recent transactions"
6. Result: Transaction doesn't appear; isn't persisted

**Timeline:**
- Recently broken (unclear when)
- Deposit always worked
- Transfer/Withdraw never worked properly

---

### 2. High-Value Transaction MFA Flow Bug

**Expected behavior:**
- When triggering high-value transaction (>$250):
  1. Show MFA verification banner/modal
  2. Offer email OTP option (based on account email)
  3. User verifies OTP
  4. Transaction completes
  
**Actual behavior:**
- Shows "Additional verification required" banner (from screenshot)
- Presents "Verify now" and "Dismiss" buttons
- Clicking "Verify now" **redirects to PingOne login page** (wrong flow)
- Should offer email OTP, not redirect to OAuth login

**Error message shown:**
```
Additional verification required.
Transfers and withdrawals of $250 or more require MFA. 
Verify your identity to continue.
```

**Root issue**: Attempting OAuth flow instead of MFA device verification

**Timeline:**
- Recently broken (likely related to recent MFA step-up implementation)

---

### 3. MFA Device Enrollment UI Missing

**Expected behavior:**
- If user has **no MFA devices enrolled**:
  1. Show enrollment popup/modal
  2. Offer FIDO2 registration
  3. Offer SMS registration
  4. Let user pick one or both
  5. Complete enrollment through PingOne
  
**Actual behavior:**
- ❌ No enrollment UI shown
- No way for user to register FIDO2 or SMS

**Follow-on expected behavior:**
- Next time HITL approval needed (e.g., next high-value transaction):
  1. Show modal with 3 MFA options: Email, SMS, FIDO2
  2. User picks one (pre-enrolled devices only)
  3. Verification proceeds with chosen method

**Information gap:** Don't know if:
- Enrollment popup *ever* surfaces
- If multiple enrollments supported
- How device list persists

---

## Screenshots Provided

1. **Withdraw Money Modal** - Shows form with amount ($200) and description field
   - Buttons: "Withdraw" (red) and "Cancel"
   - Account: savings - ****7106 ($2,000.00)

2. **Dashboard View** - Shows Account Holder and Your Accounts section
   - Checking Account: ****7106, Balance: $3,100.00
   - Savings Account: ****7106, Balance: $2,000.00
   - Each has: Select for Transfer, Deposit, Withdraw buttons (all red)

3. **MFA Verification Banner** - Yellow warning banner
   - Text: "Additional verification required. Transfers and withdrawals of $250 or more require MFA. Verify your identity to continue."
   - Buttons: "Verify now" and "Dismiss"
   - Issue: Clicking should trigger MFA flow, not OAuth redirect

---

## Investigation Scope

### RCA Needed
1. **Why Transfer/Withdraw don't persist but Deposit does**
   - Are they calling different API endpoints?
   - Different state management?
   - Different transaction storage logic?

2. **Why high-value MFA redirects to OAuth instead of device verification**
   - Which code path is executing?
   - Is MFA challenge initiation happening?
   - Where's the redirect originating?

3. **Why no MFA enrollment UI**
   - Does enrollment component exist?
   - Should it auto-show or be user-triggered?
   - Is it blocked by a feature flag?

### Code Areas Likely Affected
- `banking_api_ui/src/components/UserDashboard.tsx` - Button handlers
- `banking_api_ui/src/components/` - Transaction modals
- `banking_api_server/routes/` - Transfer/Withdraw endpoints
- `banking_api_server/services/mfaService.js` - MFA logic
- `banking_api_ui/src/context/` - Transaction state management
- `banking_api_ui/src/` - MFA enrollment UI (may not exist)

---

## Next Actions

1. **Investigate Transaction Persistence**: Compare Deposit vs Transfer/Withdraw code paths
2. **Debug MFA Flow**: Trace high-value transaction MFA trigger
3. **Check MFA Enrollment**: Verify enrollment UI exists and conditions to show it
4. **Test End-to-End**: After fixes, test:
   - All 3 buttons persist transactions
   - High-value transaction shows MFA options (not OAuth redirect)
   - New user with no devices gets enrollment UI
   - Next transaction offers device choice

---

## Evidence & Findings

(To be filled in during investigation)
