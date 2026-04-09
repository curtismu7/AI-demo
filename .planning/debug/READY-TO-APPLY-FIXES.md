# READY-TO-APPLY CODE FIXES

## Fix #1: Transaction Persistence - Copy/Paste Code

### File: `banking_api_server/routes/transactions.js`

#### Change 1: Add restore function (around line 11, after imports)

```javascript
/**
 * Re-hydrate a user's transactions from the Redis snapshot on cold-start.
 * Prevents 404 "From account not found" and missing transaction data when a 
 * Vercel lambda is recycled between challenge creation and the GET response.
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

/**
 * Persist transaction snapshot to Redis/KV for serverless cold-start recovery.
 * Keeps most recent transactions only to avoid large payloads.
 */
async function saveTransactionSnapshot(userId) {
  try {
    const existing = await demoScenarioStore.load(userId);
    const allTx = dataStore.getTransactionsByUserId(userId).slice(-50); // Keep 50 most recent
    await demoScenarioStore.save(req.user.id, {
      ...existing,
      transactionSnapshot: allTx
    });
  } catch (e) {
    console.warn('[transactions] saveTransactionSnapshot failed:', e.message);
  }
}
```

#### Change 2: Add restore call in GET /my endpoint (around line 61-65)

BEFORE (current code):
```javascript
router.get('/my', authenticateToken, async (req, res) => {
  try {
    // Log RFC 8693 delegated access for audit/demo visibility
    if (req.user.isDelegated) {
      console.log(`[transactions] Delegated access — sub=${req.user.id} act.sub=${req.user.actor?.sub}`);
    }
```

AFTER (add restore call):
```javascript
router.get('/my', authenticateToken, async (req, res) => {
  try {
    // Re-hydrate transactions from Redis snapshot in case this Lambda was cold-started.
    if (req.user.role !== 'admin') {
      await restoreTransactionsFromSnapshot(req.user.id);
    }
    
    // Log RFC 8693 delegated access for audit/demo visibility
    if (req.user.isDelegated) {
      console.log(`[transactions] Delegated access — sub=${req.user.id} act.sub=${req.user.actor?.sub}`);
    }
```

#### Change 3: Persist after transfer success (around line 420, replace old transfer response)

BEFORE (current code around line 420):
```javascript
      // Log transaction creation with client type
      console.log(`💰 [Transaction] Transfer created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const fromAcc  = dataStore.getAccountById(fromAccountId);
        const toAcc    = dataStore.getAccountById(toAccountId);
        const userName = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type: 'transfer',
          amount,
          fromAccount: fromAcc ? `${fromAcc.accountType} — ${fromAcc.accountNumber}` : fromAccountId,
          toAccount:   toAcc   ? `${toAcc.accountType} — ${toAcc.accountNumber}`     : toAccountId,
          newBalance:  dataStore.getAccountById(fromAccountId)?.balance,
          transactionId: withdrawalTransaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Transfer completed successfully',
        withdrawalTransaction,
        depositTransaction,
        ...(authorizeEvaluation && { authorizeEvaluation }),
      });
```

AFTER (add persistence before response):
```javascript
      // Log transaction creation with client type
      console.log(`💰 [Transaction] Transfer created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Persist transaction snapshot for cold-start recovery
      try {
        await saveTransactionSnapshot(req.user.id);
      } catch (e) {
        console.warn('[transactions] snapshot save (transfer) failed:', e.message);
      }

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const fromAcc  = dataStore.getAccountById(fromAccountId);
        const toAcc    = dataStore.getAccountById(toAccountId);
        const userName = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type: 'transfer',
          amount,
          fromAccount: fromAcc ? `${fromAcc.accountType} — ${fromAcc.accountNumber}` : fromAccountId,
          toAccount:   toAcc   ? `${toAcc.accountType} — ${toAcc.accountNumber}`     : toAccountId,
          newBalance:  dataStore.getAccountById(fromAccountId)?.balance,
          transactionId: withdrawalTransaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Transfer completed successfully',
        withdrawalTransaction,
        depositTransaction,
        ...(authorizeEvaluation && { authorizeEvaluation }),
      });
```

#### Change 4: Persist after single transaction success (around line 455, replace old response)

BEFORE (current code around line 455-470):
```javascript
      // Log transaction creation with client type
      console.log(`💰 [Transaction] ${type} created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const account = dataStore.getAccountById(fromAccountId || toAccountId);
        const userName = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type,
          amount,
          account: account ? `${account.accountType} — ${account.accountNumber}` : 'Unknown',
          newBalance: account?.balance,
          transactionId: transaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Success',
        transaction,
        ...(authorizeEvaluation && { authorizeEvaluation }),
      });
```

AFTER (add persistence before response):
```javascript
      // Log transaction creation with client type
      console.log(`💰 [Transaction] ${type} created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Persist transaction snapshot for cold-start recovery
      try {
        await saveTransactionSnapshot(req.user.id);
      } catch (e) {
        console.warn('[transactions] snapshot save (${type}) failed:', e.message);
      }

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const account = dataStore.getAccountById(fromAccountId || toAccountId);
        const userName = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type,
          amount,
          account: account ? `${account.accountType} — ${account.accountNumber}` : 'Unknown',
          newBalance: account?.balance,
          transactionId: transaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Success',
        transaction,
        ...(authorizeEvaluation && { authorizeEvaluation }),
      });
```

---

## Fix #2: MFA OAuth Redirect - Investigation Steps

### Step 1: Trace the 428 response

Run in terminal:
```bash
grep -n "428\|step_up_required" /Users/cmuir/P1Import-apps/Banking/banking_api_server/routes/transactions.js | head -10
```

Expected output shows where 428 is returned with step_up_method.

### Step 2: Trace frontend 428 handler

Run in terminal:
```bash
grep -n "error.response?.status === 428" /Users/cmuir/P1Import-apps/Banking/banking_api_ui/src/components/UserDashboard.js
```

Should find lines around 1030, 1080, 1150 (in the three transaction handlers).

### Step 3: Check if StepUp component exists

Run in terminal:
```bash
find /Users/cmuir/P1Import-apps/Banking/banking_api_ui/src -name "*StepUp*" -o -name "*OTP*" -o -name "*MFA*"
```

If `StepUpModal.jsx` or `OtpModal.jsx` exists:
- [ ] Check if it's mounted in UserDashboard.js
- [ ] Check if setStepUpRequired(true) triggers modal to show
- [ ] Verify modal calls correct MFA endpoint

### Step 4: Network trace

In browser DevTools Network tab:
1. Submit $500 transaction
2. Look for failed POST /api/transactions
3. Response should be 428 with `{ error: 'step_up_required', step_up_method: 'email' }`
4. Check if frontend navigates anywhere (should NOT redirect)
5. Look for GET /api/auth/... calls (would indicate wrong OAuth redirect)

---

## Fix #3: MFA Device Enrollment UI - Skeleton Code

### Create new file: `banking_api_ui/src/components/MFAEnrollmentModal.jsx`

```javascript
import React, { useState } from 'react';
import { notifySuccess, notifyError } from '../utils/appToast';
import apiClient from '../services/apiClient';
import './MFAEnrollmentModal.css';

export const MFAEnrollmentModal = ({ isOpen, onClose, onComplete, transactionPayload }) => {
  const [enrollmentMethod, setEnrollmentMethod] = useState(null); // 'email', 'sms', 'fido2'
  const [loading, setLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sent, setSent] = useState(false);

  const handleEnrollEmail = async () => {
    setLoading(true);
    try {
      const response = await apiClient.post('/api/mfa/devices/enroll', {
        type: 'email',
        sendOtp: true,
      });
      setSent(true);
      notifySuccess('OTP sent to your email');
    } catch (error) {
      notifyError('Failed to initiate email enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      await apiClient.post('/api/mfa/devices/verify-otp', {
        code: verificationCode,
      });
      notifySuccess('Email device enrolled successfully!');
      onComplete();
    } catch (error) {
      notifyError('Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="mfa-enrollment-modal-overlay">
      <div className="mfa-enrollment-modal">
        <h2>Register MFA Device</h2>
        <p>To complete this transaction, please register a device.</p>

        {!enrollmentMethod && (
          <div className="enrollment-options">
            <button onClick={() => setEnrollmentMethod('email')} className="enrollment-btn">
              📧 Email OTP
            </button>
            <button onClick={() => setEnrollmentMethod('sms')} className="enrollment-btn">
              📱 SMS
            </button>
            <button onClick={() => setEnrollmentMethod('fido2')} className="enrollment-btn">
              🔐 FIDO2 Passkey
            </button>
          </div>
        )}

        {enrollmentMethod === 'email' && !sent && (
          <div>
            <button onClick={handleEnrollEmail} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP to Email'}
            </button>
          </div>
        )}

        {enrollmentMethod === 'email' && sent && (
          <div>
            <input
              type="text"
              placeholder="Enter OTP"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength="6"
            />
            <button onClick={handleVerifyOTP} disabled={loading || !verificationCode}>
              {loading ? 'Verifying...' : 'Verify & Complete'}
            </button>
          </div>
        )}

        <button onClick={onClose} className="cancel-btn">
          Cancel
        </button>
      </div>
    </div>
  );
};
```

### Integrate into UserDashboard.js

After line 90 (after other state declarations):
```javascript
const [showMFAEnrollment, setShowMFAEnrollment] = useState(false);
const [mfaEnrollmentContext, setMFAEnrollmentContext] = useState(null);
```

In the 428 error handler (around line 1080):
```javascript
if (error.response?.status === 428) {
  // Check if user has MFA devices
  try {
    const devicesRes = await apiClient.get('/api/mfa/devices/list');
    if (devicesRes.data.devices && devicesRes.data.devices.length === 0) {
      // No devices - show enrollment
      setMFAEnrollmentContext({ transactionPayload, type });
      setShowMFAEnrollment(true);
    } else {
      // Has devices - show step-up
      setStepUpMethod(error.response.data?.step_up_method || 'email');
      setCibaStatus('idle');
      setStepUpRequired(true);
    }
  } catch (e) {
    // Fallback to step-up
    setStepUpMethod(error.response.data?.step_up_method || 'email');
    setCibaStatus('idle');
    setStepUpRequired(true);
  }
}
```

Before closing JSX (around line 2000+):
```javascript
<MFAEnrollmentModal
  isOpen={showMFAEnrollment}
  onClose={() => setShowMFAEnrollment(false)}
  onComplete={() => {
    setShowMFAEnrollment(false);
    // Retry transaction
    if (mfaEnrollmentContext?.type === 'transfer') {
      handleTransfer({...}); // Would need to refactor to replay
    }
  }}
  transactionPayload={mfaEnrollmentContext?.transactionPayload}
/>
```

---

## Test Commands

### Test Transaction Persistence
```bash
# 1. Start servers
bash run-bank.sh

# 2. In browser:
# - Login
# - Make $100 deposit
# - Make $200 transfer to other account  
# - Make $50 withdrawal
# - Refresh page (F5)
# → All 3 transactions should still be visible

# 3. Verify Redis:
redis-cli GET "banking:demo-scenario:user-{id}"
# Should contain transactionSnapshot with recent transactions
```

### Test MFA 428 Response
```bash
# In browser DevTools:
# 1. Submit $500 transaction
# 2. Check Network → POST /api/transactions
# 3. Response status should be 428 (not 200)  
# 4. Response body should have: error: "step_up_required"
# 5. Frontend should show OTP modal (not redirect)
```

### Test MFA Devices
```bash
# Check if devices endpoint exists:
curl -H "Authorization: Bearer {token}" \
  https://api.pingdemo.com:3002/api/mfa/devices/list

# Should return: { devices: [] } for new user
```

---

## Rollback Plan

If issues arise:

1. **Transaction Persistence crashes:**
   ```bash
   git diff banking_api_server/routes/transactions.js
   git checkout -- banking_api_server/routes/transactions.js
   npm run restart:api
   ```

2. **MFA breaks OAuth login:**
   ```bash
   git checkout -- banking_api_ui/src/components/UserDashboard.js
   npm run build
   ```

---

## Verification Checklist

After applying all fixes:

- [ ] Deposit persists after page refresh
- [ ] Transfer persists after page refresh
- [ ] Withdrawal persists after page refresh  
- [ ] High-value transaction shows OTP modal (not OAuth redirect)
- [ ] New user can enroll email MFA device
- [ ] After enrollment, transactions require OTP approval
- [ ] No console errors during transaction flow
- [ ] Redis contains transactionSnapshot 
- [ ] Account balances match transaction totals
