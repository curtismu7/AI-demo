# Phase 61: MCP Specification Error Code Compliance Audit - Context

## Overview

This phase conducts a comprehensive audit of our MCP (Model Context Protocol) error handling implementation to ensure full compliance with the MCP specification's error code requirements. The user specifically mentioned that MCP spec says 403 should return "invalid scopes" and 401 should return to authentication request, and wants to verify we handle all error codes correctly according to the specification.

## Current State Analysis

### Current MCP Error Handling Implementation

**Backend-for-Frontend (BFF) Error Handling**:
- **401 Handling**: Returns authentication errors, prompts for re-authentication
- **403 Handling**: Some scope validation, but may not follow MCP spec exactly
- **502 Handling**: MCP server unreachable, falls back to local tools
- **Custom Errors**: Various MCP-specific error codes and messages

**MCP Server Error Handling**:
- **AuthenticationError**: Custom error class with specific error codes
- **AuthErrorCodes**: Enum with defined error types (INVALID_AGENT_TOKEN, USER_AUTHORIZATION_REQUIRED, TOKEN_EXPIRED, INSUFFICIENT_SCOPE, etc.)
- **Protocol Errors**: Uses MCP error code -32001 for authentication failures
- **Tool Execution Errors**: Distinguishes between protocol errors and tool execution errors

### Current Error Code Mapping

**Authentication Errors**:
```typescript
export enum AuthErrorCodes {
  INVALID_AGENT_TOKEN = 'INVALID_AGENT_TOKEN',
  USER_AUTHORIZATION_REQUIRED = 'USER_AUTHORIZATION_REQUIRED', 
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  INSUFFICIENT_SCOPE = 'INSUFFICIENT_SCOPE',
  INVALID_AUTHORIZATION_CODE = 'INVALID_AUTHORIZATION_CODE',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED'
}
```

**HTTP Status Code Handling**:
- **401**: Invalid client credentials, authentication required
- **400**: Invalid token format, invalid grant
- **403**: Some scope validation (may need MCP spec compliance review)
- **502/503**: MCP server unreachable, service unavailable

## Scope

### MCP Specification Compliance Audit Objectives

1. **Error Code Mapping**: Verify all MCP specification error codes are properly mapped to HTTP responses
2. **403 Compliance**: Ensure 403 returns "invalid scopes" as per MCP specification
3. **401 Compliance**: Verify 401 properly returns to authentication request flow
4. **Protocol Errors**: Ensure MCP protocol-level errors use correct error codes
5. **Tool Execution Errors**: Verify tool-level errors don't conflict with protocol errors
6. **Error Message Format**: Ensure error messages follow MCP specification format

### Technical Implementation Areas

- **BFF Error Handling**: `server.js` MCP proxy error handling
- **MCP Server Authentication**: `AuthenticationIntegration.ts` error response creation
- **Token Introspection**: `TokenIntrospector.ts` error generation
- **Message Handling**: `MCPMessageHandler.ts` error processing
- **Scope Validation**: Scope enforcement and error generation
- **Protocol Compliance**: MCP JSON-RPC error code compliance

### MCP Specification Requirements

Based on the user's mention and standard MCP specification patterns:

**Error Code Requirements**:
- **403 Unauthorized**: MUST return "invalid scopes" error
- **401 Unauthorized**: MUST return to authentication request flow
- **Protocol Errors**: MUST use appropriate MCP error codes (-32000 to -32099)
- **Tool Errors**: MUST be distinguished from protocol errors
- **Error Format**: MUST follow MCP error response structure

**Authentication Flow Requirements**:
- **Missing Token**: Should initiate authentication flow
- **Invalid Token**: Should return to authentication request
- **Insufficient Scopes**: Should return specific "invalid scopes" error
- **Expired Token**: Should trigger refresh or re-authentication

## Technical Context

### Current Error Flow Architecture

```
Client Request → BFF → Token Exchange → MCP Server
                     ↓
                Error Handling
                     ↓
          HTTP Status Code + MCP Error Code
                     ↓
               Client Error Response
```

### Error Handling Layers

**Layer 1: BFF Error Handling**
```javascript
// Current BFF error handling patterns
if (err.httpStatus === 401) {
  // Return authentication required
  return res.status(401).json({ error: 'authentication_required' });
}

if (err.httpStatus === 403) {
  // Current handling - may need MCP spec compliance
  return res.status(403).json({ error: 'insufficient_permissions' });
}
```

**Layer 2: MCP Server Error Handling**
```typescript
// Current MCP server error handling
if (authResult.error === 'insufficient_scope') {
  return createAuthenticationErrorResponse(messageId, 'Invalid scopes');
}

if (authResult.error === 'authentication_required') {
  return createAuthenticationErrorResponse(messageId, 'Authentication required');
}
```

**Layer 3: Protocol Error Handling**
```typescript
// MCP protocol error codes
return {
  id: messageId,
  error: {
    code: -32001, // Custom authentication error
    message: 'Authentication required',
    data: errorData
  }
};
```

## Success Criteria

1. **MCP Spec Compliance**: 100% compliance with MCP specification error code requirements
2. **403 Error Handling**: Proper "invalid scopes" response for 403 status codes
3. **401 Error Handling**: Correct authentication request flow for 401 status codes
4. **Protocol Error Codes**: All MCP protocol errors use correct error code ranges
5. **Error Message Format**: All error responses follow MCP specification format

## Constraints

- **Backward Compatibility**: Must maintain existing client compatibility
- **Security Requirements**: Must not compromise security posture
- **Performance**: Error handling must not impact performance
- **Integration Requirements**: Must work with existing BFF and MCP server architecture

## Dependencies

- **Phase 56** (token-exchange-audit): Ensure token exchange errors are handled correctly
- **Phase 57** (oauth-client-credentials): Verify client credentials error handling
- **Phase 58** (rfc8693-delegation-claims): Ensure delegation error handling is compliant
- **Current MCP Implementation**: Existing MCP server and BFF error handling
- **MCP Specification**: Latest MCP specification requirements

## Risk Assessment

### Medium Risk
- **Specification Changes**: MCP specification may have evolved since our implementation
- **Client Compatibility**: Changes may break existing client integrations
- **Error Handling Complexity**: Complex error handling scenarios may have edge cases

### Low Risk
- **Implementation Exists**: We have comprehensive error handling already
- **Test Coverage**: Existing tests cover many error scenarios
- **Architecture Support**: Current architecture supports proper error handling

## Success Metrics

1. **Specification Compliance**: 100% of MCP specification error code requirements met
2. **Error Response Accuracy**: All error responses match MCP specification format
3. **Client Compatibility**: No breaking changes to existing client integrations
4. **Error Coverage**: All error scenarios properly handled and tested
5. **Documentation**: Complete error handling documentation and examples

## Timeline

**Estimated Duration**: 4-5 days
- Day 1: MCP specification review and current implementation analysis
- Day 2: Error code mapping and compliance gap identification
- Day 3: Error handling implementation updates
- Day 4: Testing and validation
- Day 5: Documentation and final verification

## Integration Benefits

### Specification Compliance Benefits
- **Interoperability**: Better compatibility with MCP clients
- **Standardization**: Consistent error handling across MCP ecosystem
- **Developer Experience**: Predictable error handling for developers
- **Future-Proofing**: Ready for MCP specification updates

### Operational Benefits
- **Debugging**: Clearer error messages and debugging information
- **Monitoring**: Better error tracking and monitoring capabilities
- **Maintenance**: Simplified error handling maintenance
- **Support**: Easier troubleshooting and support

This phase ensures our MCP implementation fully complies with the MCP specification's error handling requirements, providing a robust and standards-compliant error handling system for our Model Context Protocol integration.
