# Phase 127 Plan: Comprehensive Debug and Fix

## Overview
Systematically debug and fix critical issues preventing the app from working: pingone-test page failures, mfa-test page failures, and agent failures.

## Context
The app has multiple critical failures that prevent normal operation:
- PingOne Test page fails with errors
- MFA Test page fails with errors
- Banking Agent fails to function correctly
- Recent bug fixes (token chain, MCP agent token passing, logging) may have introduced new issues or exposed underlying problems

## Tasks

### 127-01: Debug PingOne Test page failures
**Goal:** Identify and fix errors on the PingOne Test page

**Investigation steps:**
- Check browser console for JavaScript errors on pingone-test page
- Check backend logs for API errors when accessing pingone-test endpoints
- Verify PingOne configuration (environment ID, region, client IDs)
- Test worker token acquisition
- Test asset verification endpoint
- Test individual test endpoints (authz-token, agent-token, exchanges)

**Files to examine:**
- banking_api_ui/src/components/PingOneTestPage.jsx
- banking_api_server/routes/pingoneTest.js
- banking_api_server/services/pingOneTestService.js (if exists)
- Environment configuration (.env, Vercel env vars)

**Success criteria:**
- PingOne Test page loads without errors
- Worker token acquisition succeeds
- Asset verification completes
- All test endpoints return successful responses

---

### 127-02: Debug MFA Test page failures
**Goal:** Identify and fix errors on the MFA Test page

**Investigation steps:**
- Check browser console for JavaScript errors on mfa-test page
- Check backend logs for API errors when accessing mfa-test endpoints
- Verify PingOne MFA policy configuration
- Test OTP generation and verification
- Test CIBA backchannel authentication
- Verify step-up authentication flow

**Files to examine:**
- banking_api_ui/src/components/PingOneMfaTestPage.jsx (if exists)
- banking_api_server/routes/mfaTest.js
- banking_api_server/services/mfaTestService.js (if exists)
- PingOne MFA policy configuration

**Success criteria:**
- MFA Test page loads without errors
- OTP generation and verification works
- CIBA backchannel authentication works
- Step-up authentication flow completes successfully

---

### 127-03: Debug Banking Agent failures
**Goal:** Identify and fix errors preventing the banking agent from functioning

**Investigation steps:**
- Check browser console for agent-related errors
- Check backend logs for agent initialization errors
- Verify token exchange is working correctly
- Verify MCP server connectivity
- Verify agent tool calls are being processed
- Check if recent bug fixes (token chain, MCP agent token passing) are working correctly

**Files to examine:**
- banking_api_server/services/agentBuilder.js
- banking_api_server/services/agentMcpTokenService.js
- banking_api_server/utils/mcpToolRegistry.js
- banking_api_server/services/mcpWebSocketClient.js
- banking_api_server/routes/bankingAgentRoutes.js
- banking_api_server/services/bankingAgentLangChainService.js
- Backend logs for agent initialization and tool call errors

**Success criteria:**
- Agent initializes successfully
- Token exchange completes successfully
- MCP server connectivity established
- Agent tool calls are processed correctly
- Agent returns responses to user queries

---

### 127-04: Fix identified issues
**Goal:** Implement fixes for all identified issues

**Implementation:**
- Apply fixes for PingOne Test page issues
- Apply fixes for MFA Test page issues
- Apply fixes for Banking Agent issues
- Test each fix individually
- Regression test to ensure fixes don't break other functionality

**Success criteria:**
- All identified issues are resolved
- No regressions introduced
- App functions normally end-to-end

---

### 127-05: Verify end-to-end functionality
**Goal:** Verify the entire app works correctly after fixes

**Test scenarios:**
- User login and authentication
- Banking agent queries (show accounts, transactions, etc.)
- PingOne Test page all tests pass
- MFA Test page all tests pass
- Token chain display shows events correctly
- MCP tool calls work correctly

**Success criteria:**
- All test scenarios pass
- App is stable and functional
- No console errors
- Backend logs show no critical errors

## Dependencies
- Phase 116 (full-langchain-native-agent-rebuild) - agent must be functional
- Phase 122 (conditional-step-up-authentication) - step-up auth must work
- Phase 52 (pingone-mfa-step-up) - MFA integration must work
- Recent bug fixes (token chain, MCP agent token passing, logging) - must be verified

## Risk Assessment
- High risk: Multiple critical failures may have complex root causes
- Medium risk: Fixes may introduce regressions
- Mitigation: Systematic debugging, test each fix individually, regression testing

## Estimated Duration
4-8 hours (depending on complexity of issues)

## Rollback Plan
If fixes introduce new issues, revert changes and investigate alternative approaches. Keep detailed logs of all debugging steps to enable rollback to known working state.
