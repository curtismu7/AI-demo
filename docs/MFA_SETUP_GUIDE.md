# PingOne MFA Setup Guide

## Overview

This guide provides step-by-step instructions for configuring Multi-Factor Authentication (MFA) in the Super Banking demo using PingOne's **deviceAuthentications API** approach. This setup enables step-up authentication for high-value transactions and sensitive operations.

## Implementation Approach

The Super Banking demo uses PingOne's **deviceAuthentications API** approach, which is the recommended modern method for MFA implementation. This approach provides:

- **Single endpoint, unified flow** - All MFA operations through `/deviceAuthentications`
- **Policy-driven flexibility** - MFA methods configurable without code changes
- **Multi-method support** - OTP, Push, FIDO2/WebAuthn
- **Real-time status management** - Polling for async method completion
- **Session integration** - Step-up verification with configurable TTL

> **Note**: For detailed analysis of this approach versus alternatives, see the [MFA Approach Analysis](MFA_APPROACH_ANALYSIS_AND_RECOMMENDATIONS.md).

## Prerequisites

- PingOne Advanced Identity Cloud environment with administrative access
- Super Banking demo applications already configured
- Understanding of PingOne policies and applications
- PING_ONE_MFA product in your environment Bill of Materials

## Architecture

```
User initiates sensitive action
        |
        v
Banking App detects step-up requirement
        |
        v
PingOne CIBA (Client Initiated Backchannel Authentication)
        |
        v
Device Authentication Policy (PINGONE_MFA_POLICY_ID)
        |
        v
User receives MFA prompt (OTP/FIDO2/Push)
        |
        v
User authenticates with second factor
        |
        v
PingOne returns approval token
        |
        v
Banking App proceeds with original action
```

## Part 1 - Create MFA Policy

### 1a. Navigate to Policies

1. Go to **PingOne Console** 
2. Select your environment
3. Navigate to **Identities > Policies**

### 1b. Create New Policy

1. Click **Add Policy**
2. Fill in policy details:

| Field | Value |
|-------|-------|
| **Policy Name** | `Super Banking Step-Up MFA Policy` |
| **Description** | `Step-up authentication for high-value transactions and sensitive operations in Super Banking demo` |
| **Policy Type** | `Device Authentication` |

### 1c. Configure Policy Settings

**Authentication Requirements:**

| Setting | Value | Description |
|----------|-------|-------------|
| **Required Factors** | `1` | Require at least one additional factor |
| **Allowed Methods** | `OTP, FIDO2, Push` | Support multiple MFA methods |
| **Device Binding** | `Optional` | Allow device registration for convenience |
| **Session Lifetime** | `15 minutes` | Step-up session duration |

**OTP Configuration:**

| Setting | Value |
|----------|-------|
| **OTP Length** | `6 digits` |
| **OTP Lifetime** | `5 minutes` |
| **Maximum Attempts** | `3` |
| **Lockout Duration** | `15 minutes` |

**FIDO2 Configuration:**

| Setting | Value |
|----------|-------|
| **User Verification** | `Preferred` |
| **Authenticator Attachment** | `Any` |
| **Require Resident Key** | `No` |

### 1d. Save and Note Policy ID

After saving, copy the **Policy ID** from the URL or policy details:
```
https://auth.pingone.com/{envId}/policies/{POLICY_ID}
```

This becomes your `PINGONE_MFA_POLICY_ID` environment variable.

## Part 2 - Configure Applications for MFA

### 2a. Update Super Banking User App

1. Navigate to **Applications > Applications**
2. Open **Super Banking User App**
3. Go to **Configuration tab**

**Grant Types - Ensure:**
- [x] `Authorization Code`
- [x] `Refresh Token`
- [x] `Client Initiated Backchannel Authentication (CIBA)`

**CIBA Configuration:**
- **Authentication Context Class Reference (acr_values)**: `urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy`
- **Binding Message**: `Super Banking step-up authentication required`
- **User Notification**: `Email`

### 2b. Update Super Banking Admin App

1. Open **Super Banking Admin App**
2. Go to **Configuration tab**

**Grant Types - Ensure:**
- [x] `Authorization Code`
- [x] `Refresh Token`
- [x] `Token Exchange`
- [x] `Client Initiated Backchannel Authentication (CIBA)`

**CIBA Configuration - Same as User App**

### 2c. Verify Resource Server Scopes

Ensure the following scopes include step-up requirements:

**Super Banking AI Agent Service:**
- `banking:agent:invoke` - Add ACR: `urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy`

**Super Banking MCP Server:**
- `banking:transactions:write` - Add ACR: `urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy`

## Part 3 - Environment Variables

### 3a. Backend Environment Variables

Add to `banking_api_server/.env`:

```env
# PingOne MFA Configuration
PINGONE_MFA_POLICY_ID={your-policy-id-here}
PINGONE_MFA_ACR_VALUE=urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy
PINGONE_MFA_BINDING_MESSAGE=Super Banking step-up authentication required

# Step-up thresholds (in USD)
MFA_STEP_UP_THRESHOLD=500.00
HIGH_VALUE_TRANSACTION_THRESHOLD=1000.00
```

### 3b. Frontend Environment Variables

Add to Vercel environment variables:

```env
PINGONE_MFA_POLICY_ID={your-policy-id-here}
PINGONE_MFA_ACR_VALUE=urn:pingone:policy:Super_Banking_Step_Up_MFA_Policy
```

## Part 4 - Device Enrollment

### 4a. User Device Registration

Users must register devices before they can use MFA:

1. **Navigate to User Profile**
   - User logs into Super Banking
   - Goes to **Settings > Security**

2. **Register Device**
   - Click **Register New Device**
   - Choose device type (Mobile, Desktop, Hardware Key)

3. **Complete Registration**
   - Follow device-specific registration flow
   - Verify device via email or SMS

### 4b. FIDO2 Security Key Setup

For users with FIDO2 security keys:

1. **Connect Security Key**
   - Insert USB key or ensure NFC is enabled
   - Click **Register Security Key**

2. **Follow Registration Prompts**
   - Touch key when prompted
   - Set key name/label

3. **Verify Registration**
   - Test authentication with registered key
   - Confirm key appears in device list

## Part 5 - Testing MFA Configuration

### 5a. Test Step-Up Flow

1. **Initiate High-Value Transaction**
   ```bash
   # Test transfer exceeding threshold
   curl -X POST https://banking-demo.vercel.app/api/transfer \
     -H "Authorization: Bearer {user_token}" \
     -H "Content-Type: application/json" \
     -d '{
       "fromId": "checking",
       "toId": "savings", 
       "amount": 600.00,
       "note": "Test MFA step-up"
     }'
   ```

2. **Expected Response**
   ```json
   {
     "error": "step_up_required",
     "message": "Additional authentication required",
     "step_up_method": "ciba",
     "auth_req_id": "ciba-uuid-here"
   }
   ```

### 5b. Test MFA Methods

**OTP Test:**
1. User receives email with 6-digit code
2. Enter code in Super Banking UI
3. Verify successful authentication

**FIDO2 Test:**
1. User touches security key when prompted
2. Browser authenticates with key
3. Verify successful authentication

**Push Notification Test:**
1. User receives push notification on mobile app
2. User approves/denies request
3. Verify result in Super Banking

## Part 6 - Integration with Banking Flows

### 6a. Transaction Flow Integration

```javascript
// Banking API Server - Transaction endpoint
app.post('/api/transfer', async (req, res) => {
  const { amount, fromId, toId } = req.body;
  
  // Check if amount exceeds MFA threshold
  if (amount > process.env.MFA_STEP_UP_THRESHOLD) {
    // Initiate CIBA step-up
    const cibaResponse = await initiateCibaAuth({
      loginHint: req.user.email,
      acrValues: process.env.PINGONE_MFA_ACR_VALUE,
      bindingMessage: 'Transfer requires additional authentication'
    });
    
    return res.json({
      step_up_required: true,
      auth_req_id: cibaResponse.auth_req_id,
      method: 'ciba'
    });
  }
  
  // Proceed with normal transaction
  const result = await processTransfer(req.body);
  res.json(result);
});
```

### 6b. CIBA Polling Implementation

```javascript
// Poll for CIBA completion
async function pollCibaCompletion(authReqId, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await pingOneTokenEndpoint({
      grant_type: 'urn:openid:params:grant-type:ciba',
      auth_req_id: authReqId
    });
    
    if (response.access_token) {
      return response; // Success
    }
    
    if (response.error === 'authorization_pending') {
      await new Promise(resolve => setTimeout(resolve, 2000));
      continue;
    }
    
    throw new Error(`CIBA failed: ${response.error}`);
  }
  
  throw new Error('CIBA timeout');
}
```

## Part 7 - Monitoring and Troubleshooting

### 7a. Monitoring MFA Events

Track these metrics in your monitoring system:

- MFA initiation events
- Successful MFA completions
- Failed MFA attempts
- Device registration success/failure
- CIBA polling duration

### 7b. Common Issues and Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| **CIBA not initiated** | Policy not assigned to application | Ensure policy is linked to application's CIBA configuration |
| **No MFA prompt** | User has no registered devices | Guide user through device enrollment process |
| **OTP not received** | Email delivery issues | Check email configuration and spam filters |
| **FIDO2 fails** | Browser or key compatibility | Verify browser supports WebAuthn and key is properly registered |
| **Policy timeout** | Policy session too short | Increase session lifetime in policy configuration |

### 7c. Debug Logging

Enable debug logging for MFA flows:

```javascript
// Add to banking_api_server/src/middleware/cibaHandler.js
const logger = require('./logger');

logger.debug('CIBA initiated', {
  userId: req.user.sub,
  authReqId: response.auth_req_id,
  policyId: process.env.PINGONE_MFA_POLICY_ID,
  timestamp: new Date().toISOString()
});
```

## Part 8 - Security Considerations

### 8a. Rate Limiting

Implement rate limiting for MFA attempts:

```javascript
const rateLimit = require('express-rate-limit');

const mfaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 MFA attempts per window
  message: 'Too many MFA attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});
```

### 8b. Device Management

- Regular device audit and cleanup
- Monitor for suspicious device registrations
- Implement device revocation for lost/stolen devices

### 8c. Policy Updates

- Test policy changes in non-production environment
- Communicate policy changes to users
- Maintain backward compatibility where possible

## Part 9 - User Experience

### 9a. Progressive Enhancement

- Start with OTP (universally available)
- Add FIDO2 for enhanced security
- Implement push notifications for convenience

### 9b. User Guidance

Provide clear user guidance:

- What MFA is and why it's needed
- How to register devices
- What to do during step-up authentication
- Recovery options for lost devices

### 9c. Accessibility

- Ensure MFA flows are accessible
- Provide alternative methods for users with disabilities
- Test with screen readers and other assistive technologies

## Part 10 - Maintenance

### 10a Regular Tasks

- Monthly: Review MFA success rates and failure patterns
- Quarterly: Update policy configurations as needed
- Semi-annually: Audit device registrations and clean up inactive devices

### 10b Policy Updates

When updating MFA policies:

1. Test in development environment
2. Communicate changes to users in advance
3. Monitor for increased failure rates after deployment
4. Have rollback plan ready

## Verification Checklist

- [ ] MFA policy created with correct ID
- [ ] Applications configured for CIBA
- [ ] Environment variables set correctly
- [ ] Device enrollment flow working
- [ ] Step-up authentication triggers for high-value transactions
- [ ] All MFA methods (OTP, FIDO2, Push) functional
- [ ] Monitoring and logging in place
- [ ] Rate limiting implemented
- [ ] User guidance provided
- [ ] Accessibility tested

## Support

For issues with MFA setup:

1. Check PingOne policy configuration
2. Verify application CIBA settings
3. Review environment variables
4. Test with different user accounts
5. Contact PingOne support if needed

---

**Related Documentation:**
- [PingOne CIBA Documentation](https://docs.pingidentity.com/pingone/p1_cloud__ciba_main_landing_page.html)
- [PingOne Device Authentication](https://docs.pingidentity.com/pingone/p1_cloud__device-authentication_main_landing_page.html)
- [Super Banking Token Exchange Guide](PINGONE_MAY_ACT_ONE_TOKEN_EXCHANGE.md)
