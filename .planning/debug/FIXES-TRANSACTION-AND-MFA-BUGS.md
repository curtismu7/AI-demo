# Transaction & MFA Bugs - Comprehensive Fix Guide

## Bug Summary

Three critical bugs blocking user transaction workflow:

| Bug | Issue | Impact | Severity |
|-----|-------|--------|----------|
| 1️⃣ Transaction Persistence | Transfer/Withdraw transactions lost on page refresh | Users lose transaction history | HIGH |
| 2️⃣ High-Value MFA | Redirects to PingOne OAuth instead of email OTP | Can't approve high-value transactions | CRITICAL |
| 3️⃣ MFA Device Enrollment | No UI to register FIDO2/SMS devices | Users can't set up MFA | HIGH |

---

## Bug #1: Transaction Persistence (Missing Redis Snapshot)

### Root Cause  
Transaction data isn't persisted to Redis. Only account snapshots are saved.
- Deposit/Transfer/Withdraw create transactions in memory
- These transactions are lost on page refresh (new Lambda instance)
- Account balances ARE restored from Redis (appears to work)
- But transaction records themselves disappear

### Files to Modify
- `banking_api_server/routes/transactions.js`
- `banking_api_server/services/demoScenarioStore.js` (add get/set methods if needed)

### Fix Details

**Step 1: Add restore function at top of `transactions.js`**

After line ~11, add:
```javascript
/**
 * Restore user's transactions from Redis snapshot (cold-start recovery).
 * Call this before any transaction queries on Vercel.
 */
async function restoreTransactionsFromSnapshot(userId) {
  try {
    const scenario = await demoScenarioStore.load(userId);
    if (!Array.isArray(scenario?.transactionSnapshot) || scenario.transactionSnapshot.length === 0) return;
    for (const snap of scenario.transactionSnapshot) {
      if (!dataStore.getTransactionById(snap.id)) {
        await dataStore.createTransaction(snap);
      }
    }
  } catch (e) {
    console.warn('[transactions] restoreTransactionsFromSnapshot failed:', e.message);
  }
}
```

**Step 2: Call restore in GET /my endpoint (around line 61)**

```javascript
router.get('/my', authenticateToken, async (req, res) => {
  try {
    // Re-hydrate transactions from Redis snapshot (cold-start)
    if (req.user.role !== 'admin') {
      await restoreTransactionsFromSnapshot(req.user.id);
    }
    
    // ... rest of endpoint
```

**Step 3: Persist after POST (transfer success, around line 420)**

After the transfer response is prepared, before res.status(201):
```javascript
// Persist transaction snapshot for cold-start recovery
try {
  const existing = await demoScenarioStore.load(req.user.id);
  const allTx = await Promise.all([
    dataStore.getTransactionsByUserId(req.user.id)
      .slice(-50)  // Keep only 50 most recent
  ]);
  await demoScenarioStore.save(req.user.id, {
    ...existing,
    transactionSnapshot: allTx[0] || []
  });
} catch (e) {
  console.warn('[transactions] snapshot save error:', e.message);
}

res.status(201).json({...});
```

**Step 4: Persist after POST (single transaction, around line 455)**

Same pattern as Step 3.

### Test Plan

1. Make deposit → page refresh → transaction should persist ✅
2. Make transfer → page refresh → transaction should persist ✅  
3. Make withdrawal → page refresh → transaction should persist ✅
4. Check browser Network tab → GET /api/transactions/my should hit server
5. Verify Redis: `redis-cli GET "banking:demo-scenario:{userId}"` should include transactionSnapshot

---

## Bug #2: High-Value MFA - Incorrect OAuth Redirect

### Root Cause
When transaction exceeds $250 threshold, code redirects to PingOne OAuth instead of triggering local email OTP flow.

### Current Flow (BROKEN)
1. User submits $500 transfer
2. Server returns 428 (step-up required)
3. Frontend should trigger email OTP
4. But instead... redirects to full OAuth login

### Expected Flow
1. User submits $500 transfer
2. Server returns 428 with step_up_method='email'
3. Frontend shows OTP modal
4. User enters OTP sent to email
5. Transaction completes

### Files to Check
- `banking_api_server/routes/auth.js` - Step-up endpoint
- `banking_api_ui/src/components/UserDashboard.js` - 428 error handling (line ~1080)
- `banking_api_ui/src/components/StepUpModal.jsx` or similar - MFA modal

### Debug Steps

1. **Check server-side step-up configuration:**
   ```bash
   grep -n "step_up_method\|stepUpMethod" /Users/cmuir/P1Import-apps/Banking/banking_api_server/routes/transactions.js
   grep -n "step_up_url\|stepup" /Users/cmuir/P1Import-apps/Banking/banking_api_server/routes/auth.js
   ```

2. **Check frontend step-up handler:**
   ```bash
   grep -n "428\|step_up_required\|setStepUpRequired" /Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/UserDashboard.js
   ```

3. **Find where redirect happens:**
   ```bash
   grep -rn "window.location\|navigate.*stepup\|navigate.*login" /Users/cmuir/P1Import-apps/Banking/banking_api_ui/src --include="*.js" --include="*.jsx" | grep -i mfa
   ```

### Likely Fix
In `UserDashboard.js` handleDeposit/handleTransfer/handleWithdraw catch block:

CURRENT (around line 1080):
```javascript
if (error.response?.status === 428) {
  setStepUpMethod(error.response.data?.step_up_method || 'email');
  setCibaStatus('idle');
  setStepUpRequired(true);
}
```

SHOULD:
- NOT redirect to OAuth
- SHOULD show modal with OTP input
- SHOULD call the MFA service endpoint with OTP
- SHOULD retry transaction after OTP success

### Test Plan

1. [ ] Create a transaction for $500+ (above $250 threshold)
2. [ ] Should show MFA modal (not OAuth page)
3. [ ] Modal should have email/SMS/FIDO option
4. [ ] Should send OTP to email
5. [ ] User can enter OTP and approve
6. [ ] Transaction completes and persists

---

## Bug #3: MFA Device Enrollment UI Missing

### Root Cause
No frontend component allows users to enroll FIDO2/SMS devices. When user has zero MFA devices, should trigger enrollment flow but code doesn't handle this.

### Expected Behavior

When user has NO MFA devices and initiates a high-value transaction:

1. System detects user has 0 devices
2. Shows enrollment modal with options:
   - ✅ "Register Email (via OTP)"
   - ✅ "Register SMS Device"
   - ✅ "Register FIDO2 Passkey"
3. After enrollment, returns to transaction approval
4. Next high-value transaction lets user pick device

### Files to Check
- `banking_api_ui/src/components/UserDashboard.js` - Transaction handlers
- `banking_api_ui/src/components/MFAEnrollment.jsx` (or similar) - Enrollment UI
- `banking_api_server/services/mfaService.js` - MFA device management
- `banking_api_server/routes/mfa.js` - Device enrollment endpoints

### Implementation

1. **Check if enrollment component exists:**
   ```bash
   find /Users/cmuir/P1Import-apps/Banking/banking_api_ui/src -name "*MFA*" -o -name "*Enrollment*"
   ```

2. **Check MFA endpoints:**
   ```bash
   grep -n "POST\|GET.*device\|enroll" /Users/cmuir/P1Import-apps/Banking/banking_api_server/routes/mfa.js | head -20
   ```

3. **In transaction handler, add device check:**
   ```javascript
   // After receiving 428, check if user has MFA devices
   if (error.response?.status === 428) {
     const userDevices = await apiClient.get('/api/mfa/devices/list');
     if (userDevices.data.devices.length === 0) {
       // Show enrollment modal
       setShowMFAEnrollment(true);
       setMFAEnrollmentContext({ transactionPayload, transactionType });
     } else {
       // Show device picker
       setShowMFADevicePicker(true);
     }
   }
   ```

4. **Create enrollment flow:**
   - Modal showing 3 registration methods
   - Each method calls server endpoint
   - After enrollment completes, retry transaction

### Test Plan

1. [ ] Create new user (no MFA devices)
2. [ ] Try $500 transfer
3. [ ] Should show enrollment modal (not OTP)
4. [ ] Register Email device via OTP
5. [ ] Transaction retried and approved
6. [ ] Next $500 transfer shows device picker with "Email OTP" option

---

## Combined Test Scenario

**End-to-end flow test:**

1. **Setup:** Fresh user, no MFA devices
2. **Action 1:** Deposit $100 → succeeds immediately
3. **Page Refresh** → Check deposit persists✅
4. **Action 2:** Transfer $300 (HIGH-VALUE)
   - [ ] Should show MFA enrollment (not OAuth)
   - [ ] User registers Email device
   - [ ] Enters OTP from email
   - [ ] Transfer completes
   - [ ] Transaction shows in list
5. **Page Refresh** → Check transfer persists ✅
6. **Action 3:** Withdraw $400 (HIGH-VALUE)
   - [ ] Should show device picker (Email OTP)
   - [ ] User selects Email
   - [ ] Enters OTP
   - [ ] Withdrawal completes
   - [ ] Transaction shows in list
7. **Page Refresh** → Check withdrawal persists ✅

**Success Criteria:**
- All 3 transactions show in list after refresh
- MFA flow uses email OTP not OAuth
- User can register and select devices
- Account balances match transactions

---

## Priority
1. **FIRST:** Fix #1 (Transaction Persistence) — Blocking other fixes
2. **SECOND:** Fix #2 (MFA OAuth Redirect) — Critical for high-value txns  
3. **THIRD:** Fix #3 (Enrollment UI) — Needed for first-time MFA users

**Estimated Effort:**
- Fix #1: 20-30 minutes (add snapshot code)
- Fix #2: 30-45 minutes (trace redirect, add modal)
- Fix #3: 45-60 minutes (create enrollment component)

**Total: ~2 hours for all three**
