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
      label: 'deviceAuthentications API',
      content: (
        <>
          <p>
            <strong>PingOne deviceAuthentications</strong> is the direct MFA challenge API used by this demo
            for step-up authentication. It supports OTP, push, email OTP, and FIDO2/WebAuthn.
          </p>

          <h4>Complete API flow</h4>
          <pre className="edu-code" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>{
`1. Initiate challenge
   POST https://auth.pingone.{region}/{envId}/deviceAuthentications
   Authorization: Bearer {user-access-token}
   { "user": { "id": "{userId}" },
     "policy": { "id": "{mfaPolicyId}" } }
   → { "id": "{daId}",
       "status": "DEVICE_SELECTION_REQUIRED",
       "_embedded": { "devices": [ ... ] } }

2. Select device
   PUT https://auth.pingone.{region}/{envId}/deviceAuthentications/{daId}
   { "selectedDevice": { "id": "{deviceId}" } }
   → { "status": "OTP_REQUIRED" | "ASSERTION_REQUIRED" }

3a. OTP verification
   PUT .../deviceAuthentications/{daId}
   { "selectedDevice": { "id": "{deviceId}", "otp": "123456" } }
   → { "status": "COMPLETED" | "FAILED" }

3b. FIDO2 verification
   PUT .../deviceAuthentications/{daId}
   { "assertion": { "id": "...", "response": {
       "clientDataJSON": "...",
       "authenticatorData": "...",
       "signature": "..." } } }
   → { "status": "COMPLETED" }`
          }</pre>

          <h4>Policy auto-resolution</h4>
          <p>
            Set <code>PINGONE_MFA_POLICY_ID</code> to pin a specific MFA policy.
            If unset, the BFF auto-fetches the environment&apos;s <strong>default policy</strong> from
            the Management API (<code>GET /v1/environments/&#123;envId&#125;/mfaPolicies</code>) using the
            worker token — so MFA works out of the box without extra config.
          </p>

          <h4>Device enrollment</h4>
          <pre className="edu-code" style={{ fontSize: '0.78rem', lineHeight: 1.6 }}>{
`Email OTP:
  POST https://api.pingone.{region}/v1/environments/{envId}/users/{userId}/devices
  { "type": "EMAIL", "email": "user@bank.com" }

FIDO2/WebAuthn:
  POST .../devices  { "type": "FIDO2_PLATFORM" }
  → publicKeyCredentialCreationOptions (pass to navigator.credentials.create())
  PUT .../devices/{deviceId}
  { "attestation": { "id": "...", "response": { ... } } }`
          }</pre>

          <h4>In this demo</h4>
          <ul>
            <li>Step-up triggers when transfer ≥ configured <code>STEP_UP_THRESHOLD</code></li>
            <li>BFF calls <code>/api/mfa/initiate</code> → mfaService.initiateDeviceAuth()</li>
            <li>UI polls <code>/api/mfa/status/{'{daId}'}</code> every 3 s</li>
            <li>On <code>COMPLETED</code>, the original tool call is retried automatically</li>
          </ul>
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
