// banking_api_ui/src/components/education/AgentGatewayPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { AgentGatewayContent, RFC9728Content } from './educationContent';
import { EduImplIntro, SNIP_AGENT_GATEWAY } from './educationImplementationSnippets';

export default function AgentGatewayPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'overview',
      label: 'Pattern overview',
      content: <AgentGatewayContent />,
    },
    {
      id: 'inrepo',
      label: 'In this repo',
      content: (
        <>
          <h3 style={{ marginTop: 0 }}>Resource audience + tool scopes</h3>
          <EduImplIntro repoPath="banking_api_server/services/mcpWebSocketClient.js + config (mcp_resource_uri)">
            MCP tools map to OAuth scopes; the BFF exchanges for the MCP audience before <code>tools/call</code>.
          </EduImplIntro>
          <pre className="edu-code">{SNIP_AGENT_GATEWAY}</pre>
        </>
      ),
    },
    {
      id: 'rfc9728',
      label: 'RFC 9728',
      content: <RFC9728Content />,
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Agent Gateway pattern (RFC 8707 + RFC 9728)"
      tabs={tabs}
      initialTabId={initialTabId}
      width="min(640px, 100vw)"
    />
  );
}
