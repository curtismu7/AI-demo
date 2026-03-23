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
      label: 'What is MCP',
      content: <McpProtocolContent />,
    },
    {
      id: 'catalog',
      label: 'Tool catalog',
      content: (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb', textAlign: 'left' }}>
                <th style={{ padding: '0.35rem' }}>Tool</th>
                <th style={{ padding: '0.35rem' }}>Scopes</th>
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
        </>
      ),
    },
    {
      id: 'auth',
      label: 'Auth flow',
      content: <OAuthApiCheatsheet />,
    },
    {
      id: 'hosts',
      label: 'Two hosts',
      content: (
        <>
          <p><strong>BFF path:</strong> browser session cookie → T1 → RFC 8693 → T2 → MCP WebSocket.</p>
          <p>
            <strong>LangChain agent path:</strong> separate process; may use CIBA (out-of-band approval via <strong>email or push</strong> per PingOne) or other flows → exchange → same MCP server.
          </p>
        </>
      ),
    },
    {
      id: 'inspector',
      label: 'MCP Inspector',
      content: (
        <>
          <p>Use the in-app <Link to="/mcp-inspector">MCP Inspector</Link> to call <code>tools/list</code> and <code>tools/call</code> through the BFF with your session.</p>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="MCP protocol (this demo)"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
