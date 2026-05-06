# Simulated Authorize Configuration Guide

**For:** Demo/education admins customizing the transaction authorization policy  
**Updated:** 2026-05-05

---

## Overview

The Simulated Authorize service allows you to customize which transactions trigger consent checks, step-up authentication (MFA), or confirmation dialogs. This lets you test different policy scenarios in the demo without reconfiguring PingOne Authorize.

All settings are **fully customizable via the Admin UI** at `/admin/authorize-config` or via the REST API.

---

## Configuration Options

### Amount-Based Thresholds (USD)

These apply to all transaction types unless overridden by type-based rules.

| Setting | Default | Description |
|---------|---------|-------------|
| **Confirm Amount** | $250 | Transactions at or above this amount require consent (no MFA) |
| **Step-Up Amount** | $500 | Transactions at or above this amount require consent + MFA |
| **Deny Amount** | $2,000 | Transactions above this amount are automatically denied |

**Example:**
- $100 transfer → PERMIT (below $250)
- $300 withdrawal → Require consent (between $250–$500)
- $600 transfer → Require consent + MFA (≥ $500)
- $2,500 transfer → DENY (> $2,000)

### Type-Based Rules (Transaction Types)

Override amount thresholds for specific transaction types.

| Setting | Default | Description |
|---------|---------|-------------|
| **Consent Types** | `transfer` | Transaction types that **always** require consent, regardless of amount |
| **Step-Up Types** | (empty) | Transaction types that **always** require step-up (MFA), regardless of amount |

**Examples:**

#### Example 1: Require consent for all transfers
```
Consent Types: transfer
Step-Up Types: (empty)
```
- Transfer $1 → Require consent ✅
- Transfer $500 → Require consent + MFA (amount rule) ✅
- Withdrawal $100 → PERMIT (below $250) ✅
- Deposit $300 → Require consent (amount rule) ✅

#### Example 2: Strict withdrawals + transfers
```
Consent Types: transfer,withdrawal
Step-Up Types: withdrawal
```
- Transfer $1 → Require consent ✅
- Withdrawal $50 → Require step-up + consent ✅
- Deposit $300 → Require consent (amount rule) ✅

#### Example 3: No type-based rules, amount-only
```
Consent Types: (empty)
Step-Up Types: (empty)
```
- All transactions follow amount thresholds only
- Transfer $100 → PERMIT ✅
- Withdrawal $300 → Require consent ✅

---

## API Endpoints

### GET /api/admin/authorize/config
Returns current configuration.

**Response:**
```json
{
  "simulated": {
    "confirmAmount": 250,
    "denyAmount": 2000,
    "stepUpAmount": 500,
    "consentTypes": "transfer",
    "stepUpTypes": "",
    "mcpDenyTools": [],
    "mcpHitlTools": []
  },
  "envVars": {
    "SIMULATED_AUTHORIZE_DENY_AMOUNT": "2000",
    "SIMULATED_AUTHORIZE_CONFIRM_AMOUNT": "250",
    "SIMULATED_AUTHORIZE_STEPUP_AMOUNT": "500",
    "SIMULATED_AUTHORIZE_CONSENT_TYPES": "transfer",
    "SIMULATED_AUTHORIZE_STEPUP_TYPES": "(empty)"
  }
}
```

### POST /api/admin/authorize/config
Update configuration.

**Request body:**
```json
{
  "simulated_confirm_amount": 250,
  "simulated_deny_amount": 2000,
  "simulated_stepup_amount": 500,
  "simulated_consent_types": "transfer,deposit",
  "simulated_stepup_types": "withdrawal"
}
```

All fields are **optional** — only changed fields need to be provided.

---

## Environment Variables

Can also be set via `.env` or process environment. REST API values override env vars.

```bash
# Amount thresholds (USD)
SIMULATED_AUTHORIZE_CONFIRM_AMOUNT=250
SIMULATED_AUTHORIZE_STEPUP_AMOUNT=500
SIMULATED_AUTHORIZE_DENY_AMOUNT=2000

# Type-based rules (comma-separated)
SIMULATED_AUTHORIZE_CONSENT_TYPES=transfer
SIMULATED_AUTHORIZE_STEPUP_TYPES=

# MCP tool restrictions
SIMULATED_MCP_DENY_TOOLS=
SIMULATED_MCP_HITL_TOOLS=
```

---

## Use Cases

### 1. Test Transfer Consent
**Scenario:** Ensure all transfers require approval

**Config:**
```
Consent Types: transfer
Step-Up Types: (empty)
Confirm Amount: 250
Step-Up Amount: 500
```

**Test flow:**
- User attempts transfer $1 → Consent challenge appears ✅
- User confirms OTP `123123` → Transaction executes ✅

### 2. Strict High-Value Policy
**Scenario:** Require MFA for high-value withdrawals; consent for everything else

**Config:**
```
Consent Types: deposit
Step-Up Types: withdrawal
Confirm Amount: 100
Step-Up Amount: 250
```

**Test flow:**
- Withdrawal $50 → Step-up (MFA) required ✅
- Deposit $50 → Consent required ✅
- Transfer $50 → PERMIT ✅

### 3. Education: Amount-Only Policy
**Scenario:** Teach amount-based rules without type restrictions

**Config:**
```
Consent Types: (empty)
Step-Up Types: (empty)
Confirm Amount: 500
Step-Up Amount: 1000
Deny Amount: 5000
```

**Test flow:**
- Any $300 transaction → PERMIT ✅
- Any $700 transaction → Consent ✅
- Any $1,200 transaction → Consent + MFA ✅
- Any $6,000 transaction → DENY ✅

---

## Admin UI

Visit `/admin` → **Authorize Config** to edit settings:

1. Adjust **Amount Thresholds** with sliders or input boxes
2. Enter **Consent Types** and **Step-Up Types** as comma-separated values
3. Click **Save Configuration**
4. Settings apply immediately (no restart needed)

---

## Decision Flow

When a transaction is submitted, Simulated Authorize evaluates it in this order:

```
1. Check DENY amount
   ├─ Amount > $2,000? → DENY
   └─ Proceed to step 2

2. Check type-based rules + amount-based rules
   ├─ Type in CONSENT_TYPES? → consentRequired = true
   ├─ Type in STEPUP_TYPES? → stepUpRequired = true
   ├─ Amount ≥ CONFIRM_AMOUNT? → consentRequired = true
   ├─ Amount ≥ STEPUP_AMOUNT? → stepUpRequired = true
   └─ Combine all requirements

3. Return decision
   ├─ Any requirement? → INDETERMINATE (with obligations)
   └─ No requirements? → PERMIT
```

**Example trace:**
```
Transaction: Transfer $300

Step 1: Check DENY
  → $300 < $2,000 ✓ Proceed

Step 2: Check requirements
  → Type = transfer, CONSENT_TYPES = "transfer"
     → consentRequired = true ✓
  → Amount $300 < $500 (STEPUP_AMOUNT)
     → stepUpRequired = false ✓
  → Amount $300 ≥ $250 (CONFIRM_AMOUNT)
     → consentRequired = true ✓

Step 3: Combine & return
  → INDETERMINATE, consentRequired=true, stepUpRequired=false
  → User sees: "Confirm transaction"
```

---

## FAQ

**Q: Can I set different rules for different users?**  
A: Not yet. Config is global. Future enhancement: per-role or per-department policies.

**Q: What happens if both type and amount rules trigger?**  
A: Both are combined. If type says "consent" and amount says "step-up", the result is "consent + step-up".

**Q: Can I test PingOne Authorize without changing Simulated settings?**  
A: Yes. Disable `ff_authorize_simulated` in Feature Flags to use real PingOne. Simulated settings don't apply.

**Q: Does `consentTypes = ""` (empty) mean "no consent required"?**  
A: Correct. Empty means no type-based consent rule. Amount thresholds still apply.

**Q: How do I reset to defaults?**  
A: Via API: `POST /api/admin/authorize/config` with empty object `{}`, or reload page and refresh from `.env` defaults.

---

## Testing Checklist

After changing config:

- [ ] Manually test a transaction below all thresholds → PERMIT
- [ ] Test a transaction matching a type rule → Consent challenge appears
- [ ] Test a transaction at a threshold boundary → Correct behavior
- [ ] Test OTP flow with `123123` demo code → Executes
- [ ] Check `/api/authorize/recent-decisions` or `/api/authorize/simulated-recent-decisions` for policy trace
- [ ] Check server logs for `[Authorize]` entries confirming decision path

---

## Next Steps

**Phase 2 + 3 Complete:**
- ✅ Type-based consent/step-up rules configurable
- ✅ Amount-based thresholds configurable
- ✅ Admin API for reading/writing settings
- ✅ Unified error shapes across all paths

**Future Enhancements:**
- PingOne Authorize obligation mapping (remove dependency on demo config)
- Per-user/per-role policies
- Time-based rules (e.g., higher MFA on weekends)
- Transaction history analysis (deny if unusual pattern)
