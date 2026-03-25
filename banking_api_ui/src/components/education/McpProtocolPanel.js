// banking_api_ui/src/components/education/McpProtocolPanel.js
import React from 'react';
import { Link } from 'react-router-dom';
import EducationDrawer from '../shared/EducationDrawer';
import { McpProtocolContent, OAuthApiCheatsheet } from './educationContent';

const TOOLS = [
  { name: 'get_my_accounts', scopes: 'banking read', returns: 'List of accounts for the user' },
  { name: 'get_account_balance', scopes: 'banking read', returns: 'Balance for one account' },
  { name: 'get_my_transactions', scopes: 'banking read', returns: 'Recent transactions' },
  { name: 'create_transfer', scopes: 'banking write', returns: 'Transfer confirmation / ids' },
  { name: 'create_deposit', scopes: 'banking write', returns: 'Deposit confirmation' },
  { name: 'create_withdrawal', scopes: 'banking write', returns: 'Withdrawal confirmation' },
  { name: 'query_user_by_email', scopes: 'admin', returns: 'User lookup (admin scenarios)' },
];

export default function McpProtocolPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'How it works',
      content: <McpProtocolContent />,
    },
    {
      id: 'catalog',
      label: 'Available tools',
      content: (
        <>
          <p>These are the banking actions the AI assistant can perform on your behalf:</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '0.35rem' }}>What the AI can do</th>
                <th style={{ padding: '0.35rem' }}>Access needed</th>
                <th style={{ padding: '0.35rem' }}>Returns</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map((t) => (
                <tr key={t.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.35rem' }}><code>{t.name}</code></td>
                  <td style={{ padding: '0.35rem' }}>{t.scopes}</td>
                  <td style={{ padding: '0.35rem' }}>{t.returns}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: 8 }}>
            Every tool call is checked against your permissions. The AI can only use tools that your access allows.
          </p>
        </>
      ),
    },
    {
      id: 'auth',
      label: 'Security &amp; sign-in',
      content: <OAuthApiCheatsheet />,
    },
    {
      id: 'hosts',
      label: 'Two AI paths',
      content: (
        <>
          <h3>Two ways the AI can connect</h3>
          <p>
            <strong>Web app path (you are here):</strong> when you use the banking assistant in this browser,
            your session cookie is used to verify who you are. The app exchanges this for a secure, limited-access
            AI tools pass before calling any banking functions. Your browser never holds a security token.
          </p>
          <p>
            <strong>Autonomous AI agent path:</strong> a separate AI process (powered by LangChain) can also
            connect to the same banking tools. Instead of your browser session, it uses its own machine credentials
            and can request approval from you out-of-band — for example, via an email or push notification — before
            performing high-value actions.
          </p>
          <p style={{ fontSize: '0.82rem', color: '#6b7280' }}>
            Both paths ultimately hit the same Banking Service and are subject to the same security checks.
            The difference is how they prove identity and get authorized.
          </p>
        </>
      ),
    },
    {
      id: 'inspector',
      label: 'Live inspector',
      content: (
        <>
          <p>
            Use the in-app <Link to="/mcp-inspector">MCP Inspector</Link> to see all available tools in real time
            and try calling them directly through your current session.
          </p>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="How the AI banking assistant works"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
