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
            This is the default step-up method in the Super Banking demo.
          </p>
          <h4>Supported Methods</h4>
          <ul>
            <li><strong>OTP (One-Time Password)</strong> - Time-based codes from authenticator apps</li>
            <li><strong>Push Notifications</strong> - Approval requests to mobile devices</li>
            <li><strong>FIDO2/WebAuthn</strong> - Biometric or hardware security keys</li>
          </ul>
          <h4>How It Works</h4>
          <ol>
            <li><strong>Initiate Challenge</strong> - API creates MFA challenge with user's access token</li>
            <li><strong>Device Selection</strong> - User chooses from registered devices</li>
            <li><strong>Method Execution</strong> - Complete OTP entry, push approval, or FIDO2 assertion</li>
            <li><strong>Challenge Completion</strong> - API confirms successful authentication</li>
          </ol>
          <p>
            <strong>Configuration</strong>: Requires <code>PINGONE_MFA_POLICY_ID</code> in environment settings.
            The policy determines which methods are available and security requirements.
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
