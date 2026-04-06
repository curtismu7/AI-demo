# AUDIT-03: Scope Narrowing and Audience Handling Analysis - Findings

## Executive Summary

Our scope narrowing and audience handling implementation shows **complex logic with multiple fallback mechanisms** that work but create security and maintenance challenges. The implementation correctly follows RFC 8693 principles but has over-engineered scope handling and synthetic audience injection that needs simplification.

## 🔍 Scope Narrowing Analysis

### ✅ Correct RFC 8693 Compliance

#### 1. **Proper Scope Narrowing Principle**
```javascript
// Lines 419-425: Correct narrowing logic
const userTokenScopes = new Set(
  (typeof userAccessTokenClaims?.scope === 'string'
    ? userAccessTokenClaims.scope.split(' ')
    : (userAccessTokenClaims?.scope || [])
  ).filter(Boolean)
);
const toolScopes = toolCandidateScopes.filter((s) => userTokenScopes.has(s));
```

**✅ Compliant**: PingOne can only narrow scopes, not grant new ones. Implementation correctly filters tool scopes to only those present in user token.

#### 2. **Delegation Scope Handling**
```javascript
// Lines 436-441: Proper delegation scope exclusion
const DELEGATION_ONLY_SCOPES = new Set(['banking:agent:invoke', 'ai_agent']);
const fallbackScopes = [...userTokenScopes].filter(
  (s) => (s.startsWith('banking:') || s === 'ai_agent') && !DELEGATION_ONLY_SCOPES.has(s)
);
```

**✅ Compliant**: Correctly identifies and excludes delegation-only scopes from resource access requests.

### ⚠️ Scope Narrowing Complexity Issues

#### 1. **Overly Complex Fallback Logic**
```javascript
// Lines 437-444: Complex decision tree
const effectiveToolScopes = toolScopes.length > 0
  ? toolScopes
  : (fallbackScopes && fallbackScopes.length > 0 ? fallbackScopes : toolCandidateScopes);

// Lines 448-449: Safety net with hard-coded scope
const finalScopes = validExchangeScopes.length > 0 ? validExchangeScopes : ['banking:read'];
```

**Issues**:
- **Multiple Fallback Layers**: 3-level fallback creates unpredictable behavior
- **Hard-coded Safety Net**: `['banking:read']` hard-coded as final fallback
- **Complex Decision Tree**: Difficult to reason about which scopes will be used
- **Testing Complexity**: Multiple code paths make comprehensive testing difficult

#### 2. **Hard-coded Delegation Scopes**
```javascript
// Line 436: Hard-coded delegation scope list
const DELEGATION_ONLY_SCOPES = new Set(['banking:agent:invoke', 'ai_agent']);
```

**Issues**:
- **Not Configurable**: Delegation scopes hard-coded instead of configurable
- **Maintenance Overhead**: Adding new delegation scopes requires code changes
- **Deployment Coupling**: Scope definitions tied to code deployment

#### 3. **Ambiguous Scope Priority Logic**
```javascript
// Lines 425-444: Complex scope resolution with multiple conditions
// 1. Direct match: toolScopes (user has exactly what tool needs)
// 2. Fallback match: fallbackScopes (user has some banking scopes)
// 3. Original request: toolCandidateScopes (ask PingOne to decide)
```

**Issues**:
- **Unclear Priority**: Not obvious which scopes take precedence in different scenarios
- **Edge Case Handling**: Complex logic for rare edge cases
- **Documentation Gap**: Complex logic not thoroughly documented

### 🎯 Scope Policy Analysis

#### ✅ Well-Structured Scope Policy
```javascript
// agentMcpScopePolicy.js: Clean scope definitions
const KNOWN_AGENT_MCP_SCOPES = [
  'banking:read',              // Broad umbrella scopes
  'banking:write',
  'banking:accounts:read',    // Specific scopes
  'banking:transactions:read',
  'banking:transactions:write',
  'ai_agent',
];
```

**✅ Strengths**:
- **Clear Scope Hierarchy**: Broad vs specific scope distinction
- **Comprehensive Coverage**: All necessary banking operations covered
- **Flexible Policy**: Admin-configurable allowed scopes
- **Proper Defaults**: Least surprising default (all known scopes)

#### ✅ Proper Permission Logic
```javascript
// Lines 44-49: Correct OR logic for scope permissions
function isToolPermittedByAgentPolicy(toolRequiredScopes, allowedSet) {
  return toolRequiredScopes.some((s) => allowedSet.has(s));
}
```

**✅ Compliant**: Tools can use broad or specific scopes, enabling flexible configuration.

## 🔍 Audience Handling Analysis

### ⚠️ Synthetic Audience Injection Issues

#### 1. **Educational Shortcut in Production Code**
```javascript
// Lines 496-528: Synthetic audience injection
const ffInjectAudience = configStore.getEffective('ff_inject_audience') === true ||
                        configStore.getEffective('ff_inject_audience') === 'true';

if (ffInjectAudience && userAccessTokenClaims) {
  userAccessTokenClaims = { ...userAccessTokenClaims, aud: [...audArr, mcpResourceUri] };
}
```

**Critical Issues**:
- **JWT Not Actually Modified**: Only memory snapshot changed, actual JWT unchanged
- **Educational Purpose**: Designed as demo shortcut, not production-ready
- **RFC 8707 Non-Compliance**: Doesn't use proper `resource` parameter
- **Security Risk**: May give false sense of audience compliance

#### 2. **Missing RFC 8707 Implementation**
```javascript
// Line 494: Comment acknowledges RFC 8707 but doesn't implement it
// Some PingOne token-exchange policies require the subject token to be valid for the
// requested audience (RFC 8707 resource indicators). Educational/demo only
```

**Issues**:
- **No Resource Parameter**: No `resource` parameter usage in authorization requests
- **Synthetic Workaround**: Using memory injection instead of proper RFC 8707
- **Incomplete Implementation**: Acknowledges requirement but doesn't implement

### ✅ Audience Validation Strengths

#### 1. **Proper Audience Matching**
```javascript
// Lines 646-648: Correct audience validation
const mcpTokenAud = mcpAccessTokenClaims?.aud;
const audMatches = mcpTokenAud === mcpResourceUri ||
  (Array.isArray(mcpTokenAud) && mcpTokenAud.includes(mcpResourceUri));
```

**✅ Compliant**: Proper validation that issued token audience matches requested resource.

#### 2. **Comprehensive Auditing**
```javascript
// Lines 650-674: Detailed audience audit logging
tokenEvents.push(buildTokenEvent(
  'exchanged-token',
  'MCP access token (delegated) → MCP server',
  'exchanged',
  mcpAccessTokenDecoded,
  `Audience narrowed to ${mcpResourceUri} (aud=${JSON.stringify(mcpTokenAud)}${audMatches ? ' ✅' : ' ❌ mismatch'})`,
  { audMatches, audExpected: mcpResourceUri, audActual: mcpTokenAud }
));
```

**✅ Strength**: Complete audit trail for audience validation with success/failure indicators.

## 📊 Security Assessment

### High Risk Issues

#### 1. **Synthetic Audience Injection**
- **Risk**: False sense of RFC 8707 compliance
- **Impact**: May cause production failures with strict audience validation
- **Mitigation**: Implement proper RFC 8707 resource parameters

#### 2. **Complex Scope Logic**
- **Risk**: Unintended scope grants in edge cases
- **Impact**: Potential privilege escalation
- **Mitigation**: Simplify logic, add comprehensive testing

### Medium Risk Issues

#### 1. **Hard-coded Safety Scopes**
- **Risk**: `['banking:read']` fallback may be too permissive
- **Impact**: Could grant broader access than intended
- **Mitigation**: Make safety scopes configurable

#### 2. **Configuration Validation Gaps**
- **Risk**: Invalid scope combinations may not be caught
- **Impact**: Runtime errors or unexpected behavior
- **Mitigation**: Add comprehensive scope validation

### Low Risk Issues

#### 1. **Documentation Complexity**
- **Risk**: Complex logic not well documented
- **Impact**: Maintenance difficulties
- **Mitigation**: Add detailed documentation and decision trees

## 🎯 RFC 8707 Compliance Analysis

### Current Implementation Status
- **❌ Resource Parameter**: Not implemented in authorization requests
- **❌ Proper Audience Handling**: Using synthetic injection instead
- **⚠️ Audience Validation**: Correct validation but on potentially modified data
- **✅ Audit Trail**: Comprehensive logging of audience handling

### Required Implementation
```javascript
// RFC 8707 Resource Parameter (missing)
const authUrl = `${authEndpoint}?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&resource=${mcpResourceUri}`;

// Token Request with Resource (missing)
const tokenBody = {
  grant_type: 'authorization_code',
  code: authCode,
  client_id: clientId,
  resource: mcpResourceUri  // RFC 8707 parameter
};
```

## 📋 Recommended Improvements

### Priority 1 (Critical)

#### 1. **Implement RFC 8707 Resource Parameters**
```javascript
// Add resource parameter to authorization requests
const authUrl = new URL(authorizationEndpoint);
authUrl.searchParams.set('resource', mcpResourceUri);

// Add resource parameter to token requests
const tokenBody = new URLSearchParams({
  grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
  subject_token: subjectToken,
  audience: audience,
  resource: mcpResourceUri,  // RFC 8707
  scope: scopes
});
```

#### 2. **Remove Synthetic Audience Injection**
```javascript
// Remove ff_inject_audience feature flag
// Implement proper resource parameter support instead
// Add clear error messages when audience validation fails
```

### Priority 2 (High)

#### 3. **Simplify Scope Narrowing Logic**
```javascript
// Simplified scope resolution
function resolveExchangeScopes(toolScopes, userScopes, allowedScopes) {
  // Step 1: Filter tool scopes by user token scopes
  const directMatch = toolScopes.filter(s => userScopes.has(s));
  
  // Step 2: If no direct match, use user's banking scopes (excluding delegation-only)
  const fallbackMatch = directMatch.length > 0 ? directMatch :
    userScopes.filter(s => s.startsWith('banking:') && !DELEGATION_ONLY_SCOPES.has(s));
  
  // Step 3: Validate against allowed scopes
  const validScopes = fallbackMatch.filter(s => allowedScopes.has(s));
  
  // Step 4: Ensure at least one valid scope
  return validScopes.length > 0 ? validScopes : ['banking:read'];
}
```

#### 4. **Make Delegation Scopes Configurable**
```javascript
// config.json or environment variables
{
  "delegation_only_scopes": ["banking:agent:invoke", "ai_agent"],
  "safety_fallback_scope": "banking:read"
}
```

### Priority 3 (Medium)

#### 5. **Add Comprehensive Scope Validation**
```javascript
function validateScopeConfiguration(toolScopes, userScopes, allowedScopes) {
  const issues = [];
  
  // Check for invalid scopes in configuration
  const invalidAllowed = [...allowedScopes].filter(s => !KNOWN_AGENT_MCP_SCOPES.includes(s));
  if (invalidAllowed.length > 0) {
    issues.push(`Invalid allowed scopes: ${invalidAllowed.join(', ')}`);
  }
  
  // Check for missing delegation scopes
  const hasDelegationScope = userScopes.has('banking:agent:invoke');
  if (!hasDelegationScope && toolScopes.some(s => s.startsWith('banking'))) {
    issues.push('User missing delegation scope banking:agent:invoke');
  }
  
  return issues;
}
```

#### 6. **Enhance Error Handling**
```javascript
// Detailed scope error messages
if (validScopes.length === 0) {
  throw new TokenResolutionError(
    'insufficient_scopes',
    `No valid scopes for exchange. Tool requires: ${toolScopes.join(', ')}. ` +
    `User has: ${[...userScopes].join(', ')}. ` +
    `Allowed: ${[...allowedScopes].join(', ')}`,
    403
  );
}
```

## 🧪 Test Coverage Recommendations

### Scope Narrowing Tests
- Direct scope match scenarios
- Fallback scope scenarios
- Delegation-only scope exclusion
- Invalid scope combinations
- Edge cases (empty scopes, malformed scopes)

### Audience Handling Tests
- RFC 8707 resource parameter usage
- Audience validation success/failure
- Synthetic audience injection (should be removed)
- Multiple audience handling

### Integration Tests
- End-to-end token exchange with various scope combinations
- Two-exchange delegation with scope narrowing
- Error scenarios and recovery

---

**Audit Status**: ✅ **AUDIT-03 Complete** - Scope narrowing and audience handling analyzed
**Next Review**: AUDIT-04 - Configuration Validation Analysis
**Overall Assessment**: **Functional but Over-Engineered** - needs simplification and RFC 8707 implementation
