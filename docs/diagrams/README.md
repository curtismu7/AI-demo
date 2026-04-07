# Super Banking Flow Diagrams

This directory contains enhanced draw.io flowchart diagrams for the Super Banking demo with comprehensive RFC annotations and implementation details.

## Diagrams

- `mfa-flow.drawio` - **Enhanced** MFA authentication flow with deviceAuthentications API and RFC annotations
- `user-consent-flow.drawio` - User consent and transaction approval flow  
- `agent-request-flow.drawio` - Agent request flow with token exchange
- `architecture-overview.drawio` - System architecture overview

## Download Links

| Diagram | Download |
|---------|----------|
| **Enhanced MFA Flow** | [Download](https://raw.githubusercontent.com/curtismu7/banking-demo/main/docs/diagrams/mfa-flow.drawio) |
| User Consent Flow | [Download](https://raw.githubusercontent.com/curtismu7/banking-demo/main/docs/diagrams/user-consent-flow.drawio) |
| Agent Request Flow | [Download](https://raw.githubusercontent.com/curtismu7/banking-demo/main/docs/diagrams/agent-request-flow.drawio) |
| Architecture Overview | [Download](https://raw.githubusercontent.com/curtismu7/banking-demo/main/docs/diagrams/architecture-overview.drawio) |

## How to Use

1. Right-click the download link and select "Save Link As"
2. Save the `.drawio` file to your local machine
3. Open in [app.diagrams.net](https://app.diagrams.net) or VS Code with Draw.io extension
4. Edit as needed for your documentation

## RFC Annotations

All diagrams include comprehensive RFC annotations for:

### Authentication & Authorization
- **RFC 6749** - OAuth 2.0 Authorization Framework
- **RFC 7636** - Proof Key for Code Exchange (PKCE)
- **RFC 8628** - CIBA (Client Initiated Backchannel Authentication)
- **RFC 8693** - OAuth 2.0 Token Exchange
- **RFC 8707** - Resource Indicators
- **RFC 9728** - OAuth for MCP (Model Context Protocol)

### Security & MFA
- **deviceAuthentications API** - PingOne MFA Implementation
- **STEP_UP_ACR_VALUE** - Multi-factor authentication policy
- **Session Management** - Step-up verification with TTL

### Implementation Details
- **Environment Variables** - Configuration references
- **API Endpoints** - Specific endpoint documentation
- **Error Handling** - Security error patterns
- **Security Notes** - Rate limiting and audit logging

## Enhanced Features

### MFA Flow Diagram (v2)
- **Comprehensive RFC Annotations** - All relevant RFCs referenced
- **deviceAuthentications API** - Updated to reflect current implementation
- **Multi-Method Support** - OTP, FIDO2/WebAuthn, Push notifications
- **Session Management** - 5-minute TTL for step-up verification
- **Error Handling** - Complete error flow documentation
- **Security Notes** - Rate limiting and audit requirements

### Diagram Style Guidelines
- **Consistent Color Scheme** - Professional appearance across all diagrams
- **RFC References** - Clear annotations with RFC numbers
- **Implementation Details** - Real API endpoints and parameters
- **Security Focus** - Security notes and error handling
- **Readability** - Optimized for different zoom levels

## Recent Updates

### Phase 83: AI Tokens Education
- Enhanced MFA flow diagram with deviceAuthentications API details
- Added comprehensive RFC annotations box
- Updated to reflect current Super Banking implementation
- Added session TTL and security notes
- Improved visual flow for multi-method MFA

### Integration with Documentation
- Cross-references to [AI Tokens Education](../AI_TOKENS_EDUCATION.md)
- Links to [MFA Setup Guide](../MFA_SETUP_GUIDE.md)
- References to [Features Documentation](../FEATURES.md)
- Alignment with Phase 83 educational content
