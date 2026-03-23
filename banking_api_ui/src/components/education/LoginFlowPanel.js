// banking_api_ui/src/components/education/LoginFlowPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import {
  CibaVsLoginContent,
  LoginFlowPkceContent,
  LoginFlowSecurityContent,
  OAuthApiCheatsheet,
} from './educationContent';

export default function LoginFlowPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'What happens',
      content: (
        <>
          <h3>Ten-step login walkthrough</h3>
          <ol>
            <li>You click <strong>Admin</strong> or <strong>Customer</strong> sign-in.</li>
            <li>The Banking BFF starts the OAuth 2.0 <strong>authorization code + PKCE</strong> flow.</li>
            <li>The server generates a <code>code_verifier</code> and <code>code_challenge</code>, stores the verifier server-side, and redirects your browser to PingOne.</li>
            <li>PingOne shows the login / consent UI; you enter credentials (and MFA if required).</li>
            <li>PingOne redirects back to the registered <code>redirect_uri</code> with an <strong>authorization code</strong> and the same <code>state</code> value (CSRF protection).</li>
            <li>The BFF validates <code>state</code>, exchanges the code at <code>POST …/as/token</code> with the code verifier.</li>
            <li>PingOne returns <strong>T1</strong> (access token, often a JWT) and usually a refresh token. Depending on policy, T1 may include <code>may_act</code> for later delegation.</li>
            <li>The BFF stores tokens in the <strong>server session</strong> and issues an <strong>httpOnly session cookie</strong> to your browser — T1 is not exposed to JavaScript.</li>
            <li>The session may call <code>session.regenerate()</code> on login to reduce fixation risk.</li>
            <li>You land on <code>/admin</code> or <code>/dashboard</code>; subsequent API calls use the session cookie only.</li>
          </ol>
        </>
      ),
    },
    {
      id: 'ciba',
      label: 'CIBA (OOB)',
      content: <CibaVsLoginContent />,
    },
    {
      id: 'pkce',
      label: 'PKCE deep dive',
      content: <LoginFlowPkceContent />,
    },
    {
      id: 'tokens',
      label: 'The tokens',
      content: (
        <>
          <h3>Annotated JWT payload (example)</h3>
          <pre className="edu-code">{`{
  "sub": "user id at PingOne",
  "aud": "PingOne audience / resource",
  "scope": "openid banking:read ...",
  "may_act": { "client_id": "...", ... },  // if policy issues delegation hint
  "exp": 1234567890,
  "iss": "https://auth.pingone.com/.../as"
}`}</pre>
          <ul>
            <li><strong>sub</strong> — stable subject identifier.</li>
            <li><strong>aud</strong> — who the token is for (may be PingOne resource identifier).</li>
            <li><strong>scope</strong> — granted OAuth scopes.</li>
            <li><strong>may_act</strong> — optional; indicates which client may perform token exchange on behalf of this user.</li>
            <li><strong>exp</strong> / <strong>iss</strong> — expiry and issuer.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'security',
      label: 'Security notes',
      content: <LoginFlowSecurityContent />,
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Login flow (Authorization Code + PKCE)"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
