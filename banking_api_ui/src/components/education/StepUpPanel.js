// banking_api_ui/src/components/education/StepUpPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { EduImplIntro, SNIP_STEP_UP_MOCK } from './educationImplementationSnippets';

export default function StepUpPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'What is step-up',
      content: (
        <>
          <p>
            <strong>Step-up MFA</strong> requires a stronger authentication factor (or re-auth) before high-value or sensitive actions.
            In this demo, transfers and withdrawals at or above the configured threshold can trigger PingOne step-up (see Security Settings).
          </p>
          <p>
            The Super Banking demo supports <strong>two step-up methods</strong>:
          </p>
          <ul>
            <li><strong>deviceAuthentication API</strong> - Direct PingOne MFA with OTP, Push, or FIDO2/WebAuthn</li>
            <li><strong>CIBA (Client-Initiated Backchannel)</strong> - Out-of-band email or push approval</li>
          </ul>
          <p>
            For <strong>mandatory human approval</strong> before large money movement (separate from MFA), see{' '}
            <strong>Learn → Human-in-the-loop</strong> — it explains how the consent popup and the AI agent interact.
          </p>
        </>
      ),
    },
    {
      id: 'device-auth',
      label: 'deviceAuthentication API',
      content: (
        <>
          <p>
            <strong>PingOne deviceAuthentication</strong> provides direct MFA capabilities with multiple authentication methods.
            This is the default step-up method in the Super Banking demo, offering real-time MFA challenges.
          </p>
          
          <h4>API Overview</h4>
          <p>
            The deviceAuthentication API follows RFC 8707 resource indicators and provides:
          </p>
          <ul>
            <li><strong>Endpoint</strong>: <code>POST /&#123;environmentId&#125;/as/deviceAuthentication</code></li>
            <li><strong>Authentication</strong>: User's access token in Authorization header</li>
            <li><strong>Response</strong>: Challenge details with available devices and methods</li>
            <li><strong>Completion</strong>: Polling or webhook for challenge result</li>
          </ul>
          
          <h4>Supported Methods</h4>
          <ul>
            <li><strong>OTP (One-Time Password)</strong> - Time-based codes from authenticator apps (TOTP)</li>
            <li><strong>Push Notifications</strong> - Approval requests to mobile devices via PingOne mobile app</li>
            <li><strong>FIDO2/WebAuthn</strong> - Biometric (fingerprint/face) or hardware security keys</li>
            <li><strong>Email OTP</strong> - One-time codes sent to registered email addresses</li>
            <li><strong>SMS OTP</strong> - One-time codes sent via SMS to registered phone numbers</li>
          </ul>
          
          <h4>Complete Flow Sequence</h4>
          <ol>
            <li><strong>Initiate Challenge</strong> - API creates MFA challenge with user's access token and device list</li>
            <li><strong>Device Selection</strong> - User chooses from registered MFA devices (mobile app, hardware key, etc.)</li>
            <li><strong>Method Selection</strong> - User selects preferred authentication method for the chosen device</li>
            <li><strong>Challenge Execution</strong> - Complete OTP entry, push approval, FIDO2 assertion, or biometric verification</li>
            <li><strong>Result Polling</strong> - Application polls challenge status until completion or timeout</li>
            <li><strong>Token Issuance</strong> - Upon successful MFA, PingOne issues step-up token with elevated privileges</li>
          </ol>
          
          <h4>Request/Response Example</h4>
          <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            <div><strong>Request:</strong></div>
            <div>POST /&#123;envId&#125;/as/deviceAuthentication</div>
            <div>Authorization: Bearer &#123;user_access_token&#125;</div>
            <div>{'{ "device": "mobile_app_123", "method": "push" }'}</div>
            <br />
            <div><strong>Response:</strong></div>
            <div>{'{ "challengeId": "abc123", "status": "pending", "methods": ["push", "otp"] }'}</div>
          </div>
          
          <h4>Security Features</h4>
          <ul>
            <li><strong>Device Binding</strong> - Challenges are bound to specific registered devices</li>
            <li><strong>Method Validation</strong> - Only methods enabled in MFA policy are available</li>
            <li><strong>Challenge Expiration</strong> - Challenges expire after configurable timeout (default 5 minutes)</li>
            <li><strong>Audit Trail</strong> - All MFA attempts are logged for compliance and monitoring</li>
            <li><strong>Risk-Based Context</strong> - Challenges can include risk assessment and contextual data</li>
          </ul>
          
          <h4>Integration with Banking Demo</h4>
          <p>
            In the Super Banking demo, deviceAuthentication is used for:
          </p>
          <ul>
            <li><strong>High-Value Transfers</strong> - MFA required for transfers above configured threshold</li>
            <li><strong>Sensitive Operations</strong> - Account changes, beneficiary additions, admin actions</li>
            <li><strong>Session Step-Up</strong> - Elevating session privileges for privileged operations</li>
            <li><strong>Agent Tool Access</strong> - MFA gate before AI agent can access sensitive tools</li>
          </ul>
          
          <p>
            <strong>Configuration</strong>: Requires <code>PINGONE_MFA_POLICY_ID</code> in environment settings.
            The policy determines which methods are available, security requirements, and device enrollment rules.
          </p>
          
          <div style={{ marginTop: '16px', padding: '12px', background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: '6px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#495057' }}>📊 Flow Diagram</h5>
            <p style={{ margin: '0', fontSize: '0.85rem', color: '#6c757d' }}>
              See the complete <strong>MFA deviceAuthentication Flow</strong> diagram in <code>docs/Super-Banking-MFA-DeviceAuthentication-Flow.drawio</code> for a detailed visual representation of the authentication sequence with RFC annotations.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'ciba',
      label: 'CIBA (Backchannel)',
      content: (
        <>
          <p>
            <strong>CIBA (Client-Initiated Backchannel Authentication)</strong> enables step-up without UI interaction.
            PingOne delivers approval requests out-of-band via email or push notifications.
          </p>
          <h4>When to Use CIBA</h4>
          <ul>
            <li><strong>Mobile-First Scenarios</strong> - No need to keep app open during authentication</li>
            <li><strong>Batch Operations</strong> - Authenticate multiple operations with single approval</li>
            <li><strong>High-Value Transactions</strong> - Additional security layer without user friction</li>
          </ul>
          <h4>CIBA Flow</h4>
          <ol>
            <li><strong>Initiate Backchannel</strong> - App sends CIBA request with binding_message</li>
            <li><strong>User Notification</strong> - PingOne sends email/push to user</li>
            <li><strong>User Approval</strong> - User clicks approval link or responds to push</li>
            <li><strong>Token Exchange</strong> - PingOne returns step-up token to application</li>
          </ol>
          <p>
            <strong>Setup</strong>: Enable CIBA grant type and configure DaVinci email/push policies.
            See <strong>Learn → Login flow → CIBA (OOB)</strong> for detailed setup instructions.
          </p>
        </>
      ),
    },
    {
      id: 'exchange-modes',
      label: 'Token Exchange Modes',
      content: (
        <>
          <p>
            <strong>Two Exchange Modes</strong> are supported for MCP tool access, controlled by feature flags:
          </p>
          <h4>Single Exchange (User → MCP)</h4>
          <ul>
            <li><strong>aud</strong>: <code>https://banking-mcp-server.banking-demo.com</code></li>
            <li><strong>may_act</strong>: Not used (direct delegation)</li>
            <li><strong>Flow</strong>: User token directly exchanged for MCP token</li>
            <li><strong>Feature Flag</strong>: <code>ff_two_exchange_delegation=false</code></li>
          </ul>
          
          <h4>Double Exchange (User → Agent → MCP)</h4>
          <ul>
            <li><strong>First Exchange aud</strong>: <code>https://banking-ai-agent.banking-demo.com</code></li>
            <li><strong>First Exchange may_act</strong>: <code>{`{"client_id": "pingone-agent-client-id"}`}</code></li>
            <li><strong>Second Exchange aud</strong>: <code>https://banking-mcp-server.banking-demo.com</code></li>
            <li><strong>Second Exchange may_act</strong>: Contains user delegation from first exchange</li>
            <li><strong>Feature Flag</strong>: <code>ff_two_exchange_delegation=true</code></li>
          </ul>
          
          <p>
            <strong>Configuration</strong>: Use <code>PINGONE_USE_AGENT_ACTOR_FOR_MCP=true</code> to enable double exchange mode.
            The agent client credentials are configured via <code>PINGONE_AGENT_CLIENT_ID</code> and <code>PINGONE_AGENT_CLIENT_SECRET</code>.
          </p>
        </>
      ),
    },
    {
      id: 'acr',
      label: 'ACR in PingOne',
      content: (
        <>
          <p>
            <strong>acr_values</strong> / policy names must match your PingOne <strong>Sign-On Policy</strong> (e.g. <code>Multi_factor</code>).
            Configure the required value in Security Settings so the Banking API requests the same policy PingOne enforces.
          </p>
        </>
      ),
    },
    {
      id: 'inrepo',
      label: 'In this repo',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>How step-up ties together</h3>
          <EduImplIntro mock>
            There is no single &quot;step_up()&quot; function — behavior is spread across Authorize decisions, Security Settings, and optional CIBA.
          </EduImplIntro>
          <pre className="edu-code">{SNIP_STEP_UP_MOCK}</pre>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Step-up MFA"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
