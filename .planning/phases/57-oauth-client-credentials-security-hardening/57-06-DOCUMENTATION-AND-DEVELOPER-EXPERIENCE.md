# Phase 57-06: Documentation and Developer Experience

## OAuth Client Credentials Integration Guide

### Overview

This guide provides comprehensive documentation for migrating from Personal Access Tokens (PATs) to OAuth 2.0 client credentials for AI integrations with the Super Banking platform.

### Quick Start

1. **Register your OAuth client**
2. **Receive client credentials**
3. **Request access token**
4. **Use token in API calls**
5. **Monitor usage and security**

### Step 1: Register OAuth Client

#### API Registration

```bash
curl -X POST https://banking-api.pingdemo.com/api/oauth/clients/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "client_name": "MCP Server - Banking Agent",
    "client_type": "confidential",
    "grant_types": ["client_credentials"],
    "scope": "banking:read banking:write ai_agent",
    "token_endpoint_auth_method": "client_secret_basic"
  }'
```

#### Response

```json
{
  "client_id": "mcp-server-banking-agent-12345",
  "client_secret": "generated-secret-here",
  "client_id_issued_at": 1640995200,
  "client_secret_expires_at": 0,
  "registration_access_token": "token-for-client-management",
  "scope": "banking:read banking:write ai_agent"
}
```

⚠️ **Important**: Store the `client_secret` securely. It will only be shown once.

### Step 2: Request Access Token

#### Client Credentials Grant

```bash
curl -X POST https://banking-api.pingdemo.com/api/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -d "grant_type=client_credentials&scope=banking:read banking:write"
```

#### Response

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 1800,
  "scope": "banking:read banking:write"
}
```

### Step 3: Use Token in API Calls

```bash
curl -X GET https://banking-api.pingdemo.com/api/accounts/my \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Available Scopes

#### Banking Operations
- `banking:read` - Read access to accounts, balances, transactions
- `banking:accounts:read` - Read access to account information only
- `banking:transactions:read` - Read access to transaction history only
- `banking:write` - Write access to transactions and transfers
- `banking:transactions:write` - Create and modify transactions only

#### AI Agent Operations
- `ai_agent` - General AI agent capabilities and tool invocation

#### Administrative Operations
- `admin:read` - Read access to administrative data
- `admin:write` - Write access to administrative operations
- `admin:delete` - Delete operations for administrative tasks
- `users:read` - Read access to user management data
- `users:manage` - Full user management capabilities

### Token Lifecycle

- **Access Token TTL**: 30 minutes
- **No Refresh Tokens**: Client credentials grants don't use refresh tokens
- **Automatic Re-authentication**: Request new token when current expires
- **Token Revocation**: Tokens can be revoked immediately if needed

### Migration from PATs

#### Migration Timeline

| Phase | Description | PAT Support | OAuth Support | Duration |
|-------|-------------|-------------|---------------|----------|
| Preparation | Infrastructure ready | Full | Testing | 30 days |
| Transition | Both methods supported | Full | Full | 60 days |
| Deprecation | PATs deprecated | Deprecated | Full | 90 days |
| Sunset | PATs disabled | Disabled | Full | Permanent |

#### Migration Steps

1. **Assess Current PAT Usage**
   ```bash
   # Check PAT usage statistics
   curl -X GET https://banking-api.pingdemo.com/api/oauth/migration/dashboard \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

2. **Generate OAuth Client**
   ```bash
   # Create OAuth client equivalent to PAT
   curl -X POST https://banking-api.pingdemo.com/api/oauth/clients/register \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{
       "client_name": "Migrated from PAT - Your Integration",
       "client_type": "confidential",
       "grant_types": ["client_credentials"],
       "scope": "banking:read banking:write"
     }'
   ```

3. **Update Integration Code**
   
   **Before (PAT)**:
   ```javascript
   const response = await fetch('/api/accounts/my', {
     headers: {
       'Authorization': 'PAT your-pat-token'
     }
   });
   ```

   **After (OAuth)**:
   ```javascript
   // Get access token
   const tokenResponse = await fetch('/api/oauth/token', {
     method: 'POST',
     headers: {
       'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
       'Content-Type': 'application/x-www-form-urlencoded'
     },
     body: 'grant_type=client_credentials&scope=banking:read'
   });
   
   const { access_token } = await tokenResponse.json();
   
   // Use access token
   const response = await fetch('/api/accounts/my', {
     headers: {
       'Authorization': `Bearer ${access_token}`
     }
   });
   ```

4. **Test OAuth Integration**
   ```bash
   # Test token validation
   curl -X POST https://banking-api.pingdemo.com/api/oauth/introspect \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "token=YOUR_ACCESS_TOKEN"
   ```

5. **Retire PAT**
   ```bash
   # Revoke PAT token (if supported)
   curl -X POST https://banking-api.pingdemo.com/api/pat/revoke \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     -d '{"pat_token": "your-pat-token"}'
   ```

### Security Best Practices

#### Client Credential Management

1. **Secure Storage**
   - Store client secrets in environment variables or secure vaults
   - Never commit client secrets to version control
   - Use different credentials for different environments

2. **Principle of Least Privilege**
   - Request only the scopes your application needs
   - Use specific scopes instead of broad ones when possible
   - Regularly review and reduce scope permissions

3. **Token Management**
   - Implement automatic token refresh before expiration
   - Store tokens securely in memory, not persistent storage
   - Clear tokens from memory when no longer needed

#### Monitoring and Alerting

1. **Security Dashboard**
   ```bash
   # Get security overview
   curl -X GET https://banking-api.pingdemo.com/api/security/dashboard \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

2. **Client Security Report**
   ```bash
   # Get client-specific security report
   curl -X GET https://banking-api.pingdemo.com/api/security/clients/YOUR_CLIENT_ID \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

#### Error Handling

```javascript
async function getAccessToken() {
  try {
    const response = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials&scope=banking:read'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OAuth error: ${error.error} - ${error.error_description}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to get access token:', error);
    throw error;
  }
}
```

### Code Examples

#### Node.js Integration

```javascript
class BankingOAuthClient {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken(scopes = ['banking:read']) {
    // Check if current token is still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    
    const response = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `grant_type=client_credentials&scope=${scopes.join(' ')}`
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OAuth error: ${error.error}`);
    }

    const tokenData = await response.json();
    
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000);
    
    return this.accessToken;
  }

  async makeApiCall(endpoint, method = 'GET', data = null) {
    const token = await this.getAccessToken();
    
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: data ? JSON.stringify(data) : null
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}

// Usage
const client = new BankingOAuthClient('your-client-id', 'your-client-secret');

const accounts = await client.makeApiCall('/api/accounts/my');
const transactions = await client.makeApiCall('/api/transactions/my');
```

#### Python Integration

```python
import requests
import base64
import time
from datetime import datetime, timedelta

class BankingOAuthClient:
    def __init__(self, client_id, client_secret):
        self.client_id = client_id
        self.client_secret = client_secret
        self.access_token = None
        self.token_expiry = None
    
    def get_access_token(self, scopes=['banking:read']):
        # Check if current token is still valid
        if (self.access_token and self.token_expiry and 
            datetime.now() < self.token_expiry):
            return self.access_token
        
        # Request new token
        credentials = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode()
        ).decode()
        
        response = requests.post('/api/oauth/token', 
            headers={
                'Authorization': f'Basic {credentials}',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data={
                'grant_type': 'client_credentials',
                'scope': ' '.join(scopes)
            }
        )
        
        response.raise_for_status()
        token_data = response.json()
        
        self.access_token = token_data['access_token']
        self.token_expiry = datetime.now() + timedelta(seconds=token_data['expires_in'])
        
        return self.access_token
    
    def make_api_call(self, endpoint, method='GET', data=None):
        token = self.get_access_token()
        
        response = requests.request(
            method,
            endpoint,
            headers={
                'Authorization': f'Bearer {token}',
                'Content-Type': 'application/json'
            },
            json=data
        )
        
        response.raise_for_status()
        return response.json()

# Usage
client = BankingOAuthClient('your-client-id', 'your-client-secret')

accounts = client.make_api_call('/api/accounts/my')
transactions = client.make_api_call('/api/transactions/my')
```

### Troubleshooting

#### Common Issues

1. **Invalid Client Credentials**
   ```
   Error: invalid_client
   Description: Client authentication failed
   ```
   **Solution**: Verify client_id and client_secret are correct

2. **Insufficient Scope**
   ```
   Error: insufficient_scope
   Description: Token lacks required scope for this operation
   ```
   **Solution**: Request appropriate scopes when getting access token

3. **Token Expired**
   ```
   Error: invalid_token
   Description: Token has expired
   ```
   **Solution**: Request new access token

4. **Rate Limiting**
   ```
   Error: rate_limit_exceeded
   Description: Too many requests
   ```
   **Solution**: Implement exponential backoff and respect rate limits

#### Debugging Tools

1. **Token Introspection**
   ```bash
   curl -X POST https://banking-api.pingdemo.com/api/oauth/introspect \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "token=YOUR_ACCESS_TOKEN"
   ```

2. **Client Validation**
   ```bash
   curl -X POST https://banking-api.pingdemo.com/api/oauth/clients/validate \
     -H "Content-Type: application/json" \
     -d '{"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}'
   ```

3. **Security Monitoring**
   ```bash
   curl -X GET https://banking-api.pingdemo.com/api/security/dashboard \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

### API Reference

#### OAuth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/oauth/clients/register` | POST | Register new OAuth client |
| `/api/oauth/clients/{id}` | GET | Get client information |
| `/api/oauth/clients/{id}` | PUT | Update client information |
| `/api/oauth/clients/{id}` | DELETE | Delete client |
| `/api/oauth/clients/{id}/rotate-secret` | POST | Rotate client secret |
| `/api/oauth/token` | POST | Get access token |
| `/api/oauth/introspect` | POST | Introspect token |
| `/api/oauth/revoke` | POST | Revoke token |

#### Security Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/security/dashboard` | GET | Security overview dashboard |
| `/api/security/clients/{id}` | GET | Client security report |
| `/api/security/alerts` | GET | Active security alerts |
| `/api/security/alerts/{id}/resolve` | POST | Resolve security alert |

#### Migration Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/oauth/migration/dashboard` | GET | Migration progress dashboard |
| `/api/oauth/migration/plan` | POST | Generate migration plan |
| `/api/oauth/migration/migrate` | POST | Execute migration |

### Support and Resources

#### Documentation
- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [Client Credentials Grant RFC 6749 §4.4](https://tools.ietf.org/html/rfc6749#section-4.4)
- [Token Introspection RFC 7662](https://tools.ietf.org/html/rfc7662)
- [Token Revocation RFC 7009](https://tools.ietf.org/html/rfc7009)

#### Support Channels
- Email: security-support@banking.pingdemo.com
- Documentation: https://docs.banking.pingdemo.com/oauth
- Status Page: https://status.banking.pingdemo.com

#### Community
- Developer Forum: https://community.banking.pingdemo.com
- GitHub Discussions: https://github.com/banking/super-banking/discussions
- Stack Overflow: Tag with `super-banking-oauth`

### Migration Checklist

- [ ] Register OAuth client with appropriate scopes
- [ ] Update integration code to use OAuth flow
- [ ] Implement token refresh logic
- [ ] Test all API endpoints with OAuth
- [ ] Set up monitoring and alerting
- [ ] Update documentation and runbooks
- [ ] Retire old PAT tokens
- [ ] Verify security dashboard shows OAuth usage
- [ ] Complete migration verification

---

**Last Updated**: 2026-04-06  
**Version**: 1.0  
**Contact**: security@banking.pingdemo.com
