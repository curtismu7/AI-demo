# Phase 45 Context: RFC 9728 Support

## Phase Overview
Implement support for RFC 9728 (OAuth 2.0 Resource Indicators) in the banking demo to enable precise resource targeting and access control. This RFC allows clients to specify which resource server they intend to access when requesting access tokens, providing better security and resource management capabilities.

## RFC 9728 Overview

### What is RFC 9728?
RFC 9728 "OAuth 2.0 Resource Indicators" is a specification that extends OAuth 2.0 to allow clients to include resource indicators (URIs) in authorization requests. This enables authorization servers to issue access tokens that are scoped to specific resources, improving security and reducing token scope creep.

### Key Benefits
- **Precise Access Control** — Tokens limited to specific resources
- **Reduced Attack Surface** — Tokens cannot be used for unintended resources
- **Better Auditing** — Clear resource access tracking
- **Resource Server Optimization** — Servers can optimize for specific resource types
- **Multi-Resource Support** — Single token for multiple specific resources

### Resource Indicator Format
```
resource: urn:ietf:params:oauth:resource
resource: https://api.example.com/resource
resource: api://banking.example.com/accounts
resource: https://banking.example.com/transactions
```

## Current State Analysis

### Existing OAuth Implementation
- **OAuth 2.0 + PKCE** — User authentication flow implemented
- **JWT Access Tokens** — Standard token format with scopes
- **Scope-Based Authorization** — Current authorization uses scopes only
- **Multiple Resource Servers** — Banking API, MCP server, admin API
- **Token Exchange** — RFC 8693 delegation implemented

### Current Authorization Model
- **Scopes Only** — Tokens contain scopes but no resource indicators
- **Broad Access** — Tokens can access multiple resource servers
- **Limited Granularity** — Coarse-grained access control
- **Resource Ambiguity** — Tokens not tied to specific resources

### Integration Points
- **Banking API Server** — Primary resource server for banking operations
- **MCP Server** — AI agent resource server
- **Admin API** — Administrative resource server
- **Configuration API** — System configuration resource server

## Target Implementation

### Resource Indicator Strategy
1. **Banking Resources** — `https://banking-api.example.com/`
2. **Agent Resources** — `https://mcp-server.example.com/`
3. **Admin Resources** — `https://admin-api.example.com/`
4. **Config Resources** — `https://config-api.example.com/`

### Multi-Resource Scenarios
- **Banking + Agent** — Combined access for AI-assisted banking
- **Admin + Config** — System management operations
- **All Resources** — Full administrative access
- **Single Resource** — Focused access to specific service

### Security Enhancements
- **Resource Binding** — Tokens cryptographically bound to resources
- **Audience Restriction** — `aud` claim limited to specific resources
- **Resource Validation** — Resource servers validate token binding
- **Cross-Resource Prevention** — Tokens cannot access unintended resources

## Technical Implementation

### Authorization Request Enhancement
```javascript
// Current request (scopes only)
const authRequest = {
  response_type: 'code',
  client_id: client_id,
  redirect_uri: redirect_uri,
  scope: 'banking:read banking:write',
  state: state,
  code_challenge: code_challenge,
  code_challenge_method: 'S256'
};

// Enhanced request with resource indicators
const enhancedAuthRequest = {
  response_type: 'code',
  client_id: client_id,
  redirect_uri: redirect_uri,
  scope: 'banking:read banking:write',
  resource: [
    'https://banking-api.example.com/',
    'https://mcp-server.example.com/'
  ],
  state: state,
  code_challenge: code_challenge,
  code_challenge_method: 'S256'
};
```

### Token Response Enhancement
```javascript
// Enhanced token response with resource indicators
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "banking:read banking:write",
  "resource": [
    "https://banking-api.example.com/",
    "https://mcp-server.example.com/"
  ]
}
```

### JWT Token Enhancement
```json
{
  "iss": "https://auth.pingone.com/as/oauth2",
  "sub": "user-123",
  "aud": ["https://banking-api.example.com/", "https://mcp-server.example.com/"],
  "exp": 1640995200,
  "iat": 1640991600,
  "scope": "banking:read banking:write",
  "resource": ["https://banking-api.example.com/", "https://mcp-server.example.com/"],
  "client_id": "banking-demo-client"
}
```

## Implementation Strategy

### Phase 1: Backend Support (Days 1-2)
- Update authorization endpoint to accept resource indicators
- Enhance token issuance to include resource indicators
- Modify token validation to check resource binding
- Update resource server validation logic

### Phase 2: Frontend Integration (Days 2-3)
- Update OAuth client to send resource indicators
- Modify token storage to handle resource indicators
- Update UI to show resource access scope
- Add resource selection in authorization flows

### Phase 3: Multi-Resource Support (Days 3-4)
- Implement multi-resource token requests
- Add resource selection UI components
- Create resource-based authorization logic
- Test cross-resource scenarios

### Phase 4: Security and Testing (Days 4-5)
- Implement resource binding validation
- Add security controls for resource indicators
- Test token exchange with resource indicators
- Create comprehensive test suite

## Security Considerations

### Token Security
- **Resource Binding** — Tokens cryptographically bound to resources
- **Audience Validation** — Strict `aud` claim validation
- **Resource Validation** — Resource servers validate token binding
- **Cross-Resource Prevention** — Prevent token reuse across resources

### Authorization Security
- **Resource Scope Validation** — Ensure scopes match resources
- **Resource Indicator Validation** — Validate resource URI format
- **Client Authorization** — Ensure clients can request intended resources
- **User Consent** — Clear user consent for resource access

### Implementation Security
- **URI Validation** — Prevent malicious resource indicators
- **Resource Discovery** — Secure resource indicator discovery
- **Token Leakage Prevention** — Prevent token reuse across resources
- **Audit Trail** — Track resource access and violations

## Use Cases and Scenarios

### Banking-Only Access
- **Resource**: `https://banking-api.example.com/`
- **Scopes**: `banking:read banking:write`
- **Use Case**: Direct banking operations without AI assistance

### AI-Assisted Banking
- **Resources**: [
  `https://banking-api.example.com/`,
  `https://mcp-server.example.com/`
]
- **Scopes**: `banking:read banking:write ai:act`
- **Use Case**: AI agent assisting with banking operations

### Administrative Access
- **Resources**: [
  `https://admin-api.example.com/`,
  `https://config-api.example.com/`
]
- **Scopes**: `admin:read admin:write config:read config:write`
- **Use Case**: System administration and configuration

### Full Access
- **Resources**: [
  `https://banking-api.example.com/`,
  `https://mcp-server.example.com/`,
  `https://admin-api.example.com/`,
  `https://config-api.example.com/`
]
- **Scopes**: All available scopes
- **Use Case**: Complete system access for administrators

## Configuration and Customization

### Resource Configuration
```javascript
const resourceConfig = {
  resources: {
    'https://banking-api.example.com/': {
      name: 'Banking API',
      description: 'Core banking operations and account management',
      scopes: ['banking:read', 'banking:write', 'transactions:read'],
      required: false
    },
    'https://mcp-server.example.com/': {
      name: 'MCP Server',
      description: 'AI agent and MCP protocol server',
      scopes: ['ai:act', 'ai:read', 'ai:write'],
      required: false
    },
    'https://admin-api.example.com/': {
      name: 'Admin API',
      description: 'Administrative operations and user management',
      scopes: ['admin:read', 'admin:write', 'users:manage'],
      required: false
    }
  },
  defaultResources: ['https://banking-api.example.com/'],
  resourceSelection: 'optional' // 'required', 'optional', 'hidden'
};
```

### Client Configuration
```javascript
const clientConfig = {
  client_id: 'banking-demo-client',
  resource_indicators: {
    allowed_resources: [
      'https://banking-api.example.com/',
      'https://mcp-server.example.com/',
      'https://admin-api.example.com/'
    ],
    default_resources: ['https://banking-api.example.com/'],
    require_user_consent: true,
    max_resources: 3
  }
};
```

## Success Metrics

### Security Metrics
- **Resource Binding Success** — 100% of tokens properly bound to resources
- **Cross-Resource Prevention** — 0 successful cross-resource token reuse
- **Authorization Accuracy** — 100% accurate resource-based authorization
- **Token Scope Reduction** — 50% reduction in unnecessary token scopes

### User Experience Metrics
- **Authorization Clarity** — 90% user understanding of resource access
- **Consent Satisfaction** — 95% user satisfaction with resource consent
- **Error Reduction** — 80% reduction in authorization errors
- **Task Completion** — Improved completion rates for multi-resource tasks

### Technical Metrics
- **Implementation Coverage** — 100% of OAuth flows support resource indicators
- **Performance Impact** — <5% performance overhead for resource validation
- **Compatibility** — 100% backward compatibility with existing clients
- **Test Coverage** — 95% test coverage for resource indicator features

## Dependencies

### Prerequisites
- Phase 18 (Token Chain) — Token exchange and delegation foundation
- Phase 17 (PingOne AI Principles) — Security best practices
- Phase 43 (Multi-vertical) — Resource server architecture

### Related Work
- Phase 46 (PingOne Naming) — Consistent resource naming
- Phase 50 (App Config) — Resource server configuration
- OAuth 2.1 implementation — Enhanced authorization features

## Risk Mitigation

### Security Risks
- **Resource Indicator Injection** — Validate and sanitize resource URIs
- **Token Scope Creep** — Strict resource-to-scope validation
- **Cross-Resource Token Abuse** — Cryptographic resource binding
- **Resource Discovery Attacks** — Secure resource indicator management

### Implementation Risks
- **Backward Compatibility** — Maintain support for existing clients
- **Performance Impact** — Optimize resource validation
- **Configuration Complexity** — Simplify resource configuration
- **User Confusion** — Clear UI for resource selection

## Testing Strategy

### Unit Testing
- Resource indicator validation
- Token generation with resource binding
- Resource server validation logic
- Authorization decision making

### Integration Testing
- End-to-end OAuth flows with resource indicators
- Multi-resource token requests
- Cross-resource token rejection
- Token exchange with resource indicators

### Security Testing
- Resource indicator injection attempts
- Cross-resource token abuse scenarios
- Token binding validation
- Authorization bypass attempts

### User Experience Testing
- Resource selection UI usability
- Authorization consent clarity
- Error handling and recovery
- Multi-resource task completion

## Deliverables

### Backend Implementation
- **Enhanced Authorization Endpoint** — Resource indicator support
- **Token Service Updates** — Resource binding in JWT tokens
- **Resource Server Validation** — Resource-based token validation
- **Configuration Service** — Resource indicator management

### Frontend Implementation
- **OAuth Client Updates** — Resource indicator support
- **Resource Selection UI** — User-friendly resource selection
- **Token Storage Updates** — Handle resource indicators
- **Authorization Flow Updates** — Enhanced consent UI

### Documentation
- **Implementation Guide** — RFC 9728 integration documentation
- **Security Analysis** — Threat model and mitigation strategies
- **Configuration Guide** — Resource indicator configuration
- **Testing Procedures** — Comprehensive testing documentation

## Success Criteria

### Must Have
- [ ] RFC 9728 compliant resource indicator support
- [ ] Resource binding in JWT tokens
- [ ] Resource server validation implementation
- [ ] Multi-resource token support
- [ ] Backward compatibility maintained

### Should Have
- [ ] Resource selection UI components
- [ ] Enhanced authorization consent flows
- [ ] Resource-based authorization decisions
- [ ] Comprehensive test coverage
- [ ] Performance optimization

### Could Have
- [ ] Dynamic resource discovery
- [ ] Resource-based rate limiting
- [ ] Advanced resource selection algorithms
- [ ] Resource usage analytics
- [ ] Cross-resource audit correlation
