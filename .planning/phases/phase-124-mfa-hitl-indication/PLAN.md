# Phase 124 Plan: MFA HITL Indication

## Overview
Add clear Human-in-the-Loop (HITL) indication to MFA prompts so users understand when they need to manually approve a transaction.

## Tasks

### 124-01: Add HITL indicator text to MFA prompt UI
**Goal:** Update MFA prompt UI to include clear HITL indicator text

**Implementation:**
- Update SessionReauthBanner component to include HITL context
- Add text like "Manual approval required" or "Your approval is needed" when step-up MFA is triggered
- Check if the MFA request is for step-up authentication (vs regular login)
- Display HITL-specific messaging for step-up scenarios

**Files to modify:**
- banking_api_ui/src/components/SessionReauthBanner.jsx

**Success criteria:**
- MFA prompt shows clear text indicating HITL status
- Text is user-friendly and actionable
- Distinguishes between login MFA and step-up MFA

---

### 124-02: Add visual cue (icon/badge) for HITL status
**Goal:** Add visual cue (icon/badge) distinguishing HITL from automatic MFA

**Implementation:**
- Add icon (e.g., user/hand icon) to indicate manual approval
- Add badge or banner styling for HITL scenarios
- Use color coding to distinguish HITL (e.g., orange/amber badge)
- Ensure visual cue is accessible (ARIA labels, screen reader support)

**Files to modify:**
- banking_api_ui/src/components/SessionReauthBanner.jsx
- banking_api_ui/src/components/SessionReauthBanner.css

**Success criteria:**
- Visual cue clearly indicates HITL status
- Accessible to screen readers
- Consistent with Chase.com UI patterns

---

### 124-03: Update transaction approval flow to show HITL state
**Goal:** Update transaction approval flow to show HITL state

**Implementation:**
- Pass HITL context from backend to frontend in step-up MFA scenarios
- Update transaction components to display HITL state when MFA is pending
- Show transaction details requiring manual approval
- Add progress indicator for HITL approval workflow

**Files to modify:**
- banking_api_server/middleware/stepUpAuth.js (if exists)
- banking_api_ui/src/components/TransactionConsentPage.jsx
- banking_api_ui/src/components/UserTransactions.jsx

**Success criteria:**
- Transaction approval shows HITL state
- Users can see which transaction requires approval
- Progress indicator shows approval workflow status

---

### 124-04: Add education panel explaining HITL concept
**Goal:** Add education panel explaining HITL concept in context

**Implementation:**
- Create education panel ID for HITL explanation
- Add content explaining what HITL means in banking context
- Show panel when HITL MFA is triggered
- Include examples of when HITL is required (high-value transactions)

**Files to modify:**
- banking_api_ui/src/education/educationIds.js
- banking_api_ui/src/education/educationContent.js
- banking_api_ui/src/components/SessionReauthBanner.jsx

**Success criteria:**
- Education panel explains HITL concept clearly
- Panel appears in context when HITL is triggered
- Content is concise and actionable

---

### 124-05: Update SessionReauthBanner to include HITL context
**Goal:** Update SessionReauthBanner to include HITL context when relevant

**Implementation:**
- Add prop to SessionReauthBanner for HITL context
- Update component to display HITL-specific messaging and visual cues
- Ensure banner works for both login and step-up scenarios
- Test with different MFA triggers (login, step-up, session expiry)

**Files to modify:**
- banking_api_ui/src/components/SessionReauthBanner.jsx
- banking_api_ui/src/App.js (to pass HITL context)

**Success criteria:**
- Banner shows HITL context when step-up MFA is triggered
- Banner works correctly for all MFA scenarios
- No breaking changes to existing banner behavior

---

### 124-06: Test HITL indication across transaction types
**Goal:** Test HITL indication across different transaction types (deposits, transfers, payments)

**Implementation:**
- Test with deposits exceeding STEP_UP_AMOUNT_THRESHOLD
- Test with transfers exceeding threshold
- Test with payments exceeding threshold
- Test with transactions below threshold (should not trigger HITL)
- Verify HITL indication appears correctly in all scenarios

**Files to test:**
- banking_api_ui/src/components/TransactionConsentPage.jsx
- banking_api_ui/src/components/UserTransactions.jsx
- banking_api_ui/src/components/SessionReauthBanner.jsx

**Success criteria:**
- HITL indication appears for all high-value transactions
- No HITL indication for low-value transactions
- Consistent behavior across transaction types
- User experience is clear and intuitive

## Dependencies
- Phase 122 (conditional-step-up-authentication) must be complete
- Phase 52 (pingone-mfa-step-up) must be functional
- PingOne MFA policy must be configured with STEP_UP_AMOUNT_THRESHOLD

## Risk Assessment
- Low risk: UI-only changes, no backend logic changes
- Medium risk: Need to ensure HITL context is correctly passed from backend
- Mitigation: Test with different transaction amounts and types

## Rollback Plan
If issues arise, revert UI changes to SessionReauthBanner and related components. No backend changes to rollback.
