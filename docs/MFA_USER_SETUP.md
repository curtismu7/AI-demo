# MFA Setup and Testing Guide

> Quick guide for setting up and testing Multi-Factor Authentication (MFA) with OTP and FIDO2 in Super Banking.

---

## Quick Start

To test MFA quickly, you need:
1. A PingOne account with MFA policy configured
2. A test user account
3. Access to email (for OTP)
4. Optional: FIDO2 security key (for FIDO2 testing)

---

## Step 1: Configure PingOne MFA Policy

### 1.1 Create MFA Policy in PingOne

1. Log in to PingOne Admin Console
2. Navigate to **Identities > Policies**
3. Click **Add Policy**
4. Fill in policy details:
   - **Policy Name:** `Super Banking Step-Up MFA Policy`
   - **Description:** `Step-up authentication for high-value transactions`
   - **Policy Type:** `Device Authentication`

### 1.2 Configure Policy Settings

**Authentication Requirements:**
- Required Factors: `1`
- Allowed Methods: `OTP, FIDO2, Push`
- Device Binding: `Optional`
- Session Lifetime: `15 minutes`

**OTP Configuration:**
- OTP Length: `6 digits`
- OTP Lifetime: `5 minutes`
- Maximum Attempts: `3`
- Lockout Duration: `15 minutes`

**FIDO2 Configuration:**
- User Verification: `Preferred`
- Authenticator Attachment: `Any`
- Require Resident Key: `No`

### 1.3 Save and Note Policy ID

After saving, copy the **Policy ID** from the URL:
```
https://auth.pingone.com/{envId}/policies/{POLICY_ID}
```

---

## Step 2: Configure Environment Variables

Add to `banking_api_server/.env`:

```env
# MFA Configuration
PINGONE_MFA_POLICY_ID={your-policy-id-here}
PINGONE_MFA_ACR_VALUE=urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy
PINGONE_MFA_BINDING_MESSAGE=Super Banking step-up authentication required

# MFA Thresholds (in USD)
MFA_STEP_UP_THRESHOLD=500.00
HIGH_VALUE_TRANSACTION_THRESHOLD=1000.00

# Enable CIBA for MFA
CIBA_ENABLED=true
```

---

## Step 3: Register MFA Device

### 3.1 Register Device in Super Banking

1. Log in to Super Banking
2. Navigate to **Settings > Security**
3. Click **Register New Device**
4. Choose device type:
   - **Mobile** - For OTP via email
   - **Security Key** - For FIDO2/WebAuthn
5. Follow the registration prompts
6. Verify device via email or SMS

### 3.2 Register FIDO2 Security Key (Optional)

If you have a FIDO2 security key:

1. Connect your USB key or enable NFC
2. Click **Register Security Key** in Settings
3. Touch the key when prompted
4. Set a name for your key
5. Test authentication to verify

---

## Step 4: Test OTP MFA

### 4.1 Test OTP via High-Value Transaction

1. Log in to Super Banking
2. Navigate to **Dashboard**
3. Click **Transfer** or go to **Transfers**
4. Enter transfer details:
   - From: Checking
   - To: Savings
   - Amount: `$600` (exceeds $500 threshold)
5. Click **Review Transfer**
6. Click **Confirm Transfer**
7. **MFA prompt should appear**
8. Check your email for 6-digit OTP code
9. Enter the OTP code in the MFA prompt
10. Click **Verify**
11. Transaction should complete successfully

### 4.2 Verify OTP Works

- ✅ MFA prompt appears for high-value transactions
- ✅ OTP email received within 30 seconds
- ✅ OTP code is 6 digits
- ✅ Entering correct OTP allows transaction
- ✅ Transaction appears in transaction history

### 4.3 Test OTP Error Handling

**Test Wrong OTP:**
1. Initiate high-value transaction
2. Enter incorrect OTP (e.g., 123456)
3. Should see error: "Invalid OTP code"
4. Enter correct OTP
5. Transaction should complete

**Test Expired OTP:**
1. Initiate high-value transaction
2. Wait 6 minutes (OTP expires after 5 minutes)
3. Enter the expired OTP
4. Should see error: "OTP has expired"
5. Request new OTP
6. Enter new OTP
7. Transaction should complete

---

## Step 5: Test FIDO2 MFA

### 5.1 Prerequisites

- FIDO2 security key registered (see Step 3.2)
- Browser supporting WebAuthn (Chrome, Firefox, Safari, Edge)
- Security key connected (USB or NFC)

### 5.2 Test FIDO2 via High-Value Transaction

1. Log in to Super Banking
2. Navigate to **Dashboard**
3. Click **Transfer**
4. Enter transfer details:
   - From: Checking
   - To: Savings
   - Amount: `$600`
5. Click **Confirm Transfer**
6. When MFA prompt appears, select **FIDO2** method
7. Touch your security key when prompted
8. Transaction should complete successfully

### 5.3 Verify FIDO2 Works

- ✅ FIDO2 option available in MFA prompt
- ✅ Browser prompts for security key
- ✅ Touching key authenticates
- ✅ Transaction completes successfully

### 5.4 Test FIDO2 Error Handling

**Test No Key Registered:**
1. Remove all FIDO2 keys from Settings
2. Initiate high-value transaction
3. Select FIDO2 method
4. Should see error: "No security key registered"
5. Switch to OTP method
6. Complete transaction with OTP

---

## Step 6: Test MFA Threshold

### 6.1 Test Below Threshold (No MFA)

1. Initiate transfer for `$200` (below $500 threshold)
2. Click **Confirm Transfer**
3. **No MFA prompt should appear**
4. Transaction should complete immediately

### 6.2 Test Above Threshold (MFA Required)

1. Initiate transfer for `$600` (above $500 threshold)
2. Click **Confirm Transfer**
3. **MFA prompt should appear**
4. Complete MFA
5. Transaction should complete

---

## Step 7: Test MFA Session Persistence

### 7.1 Test Session Valid

1. Complete MFA for high-value transaction
2. Initiate another high-value transaction within 10 minutes
3. **No MFA prompt should appear** (session still valid)
4. Transaction should complete immediately

### 7.2 Test Session Expired

1. Wait 16 minutes (session expires after 15 minutes)
2. Initiate high-value transaction
3. **MFA prompt should appear again**
4. Complete MFA
5. Transaction should complete

---

## Automated Testing Script

For automated testing, use the test script:

```bash
# Set environment variables
export API_URL=http://localhost:3001
export MFA_TEST_USER=your-test-user
export MFA_TEST_PASSWORD=your-test-password
export MFA_TEST_EMAIL=your-email@example.com

# Run all tests
node scripts/test-mfa.js

# Run OTP tests only
node scripts/test-mfa.js --test=otp

# Run FIDO2 tests only (requires manual browser interaction)
node scripts/test-mfa.js --test=fido2
```

The script will:
- Check MFA configuration
- Test login
- Test MFA trigger conditions
- Test OTP and FIDO2 availability
- Generate test report in `test-results/mfa-test-results.json`

---

## Troubleshooting

### MFA Not Triggered

**Problem:** High-value transaction completes without MFA prompt

**Solutions:**
- Verify `PINGONE_MFA_POLICY_ID` is set correctly
- Check `MFA_STEP_UP_THRESHOLD` environment variable
- Ensure CIBA is enabled: `CIBA_ENABLED=true`
- Restart the API server after changing environment variables

### OTP Not Received

**Problem:** No OTP email received

**Solutions:**
- Check email spam folder
- Verify email address in PingOne user profile
- Ensure email notifications are enabled in PingOne policy
- Check email delivery service is working

### FIDO2 Not Available

**Problem:** FIDO2 option not showing in MFA prompt

**Solutions:**
- Ensure FIDO2 security key is registered in Settings
- Check browser supports WebAuthn
- Verify security key is connected (USB or NFC)
- Try different browser (Chrome, Firefox, Safari, Edge)

### Account Locked

**Problem:** Account locked after 3 failed MFA attempts

**Solutions:**
- Wait 15 minutes for lockout to expire
- Contact admin to unlock account
- Increase maximum attempts in PingOne policy

---

## Testing Checklist

Before testing:
- [ ] PingOne MFA policy created and configured
- [ ] Environment variables set in `.env`
- [ ] Test user account created
- [ ] Test email account accessible
- [ ] FIDO2 security key available (for FIDO2 tests)
- [ ] Browser supports WebAuthn
- [ ] Application running

OTP Testing:
- [ ] MFA triggers for high-value transactions
- [ ] OTP email received
- [ ] Correct OTP works
- [ ] Wrong OTP rejected
- [ ] Expired OTP rejected

FIDO2 Testing:
- [ ] FIDO2 option available
- [ ] Security key prompt appears
- [ ] Touching key authenticates
- [ ] No key shows error

Threshold Testing:
- [ ] No MFA below threshold
- [ ] MFA required above threshold

Session Testing:
- [ ] Session persists for 15 minutes
- [ ] Session expires after 15 minutes

---

## Next Steps

After successful MFA testing:

1. **Enable MFA for Production:**
   - Update production environment variables
   - Configure production PingOne policy
   - Test in staging environment first

2. **User Onboarding:**
   - Create user guide for MFA setup
   - Provide training materials
   - Set up support documentation

3. **Monitoring:**
   - Monitor MFA success rates
   - Track failed attempts
   - Set up alerts for issues

---

## Support

For issues with MFA setup or testing:

- Check [MFA_TEST_PLAN.md](./MFA_TEST_PLAN.md) for detailed test procedures
- Check [USER_GUIDE.md](./USER_GUIDE.md) for user-facing MFA guide
- Review server logs for error messages
- Contact support with test results and error details

---

**Last Updated:** April 10, 2026
**Version:** 1.0
