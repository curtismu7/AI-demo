// banking_api_ui/src/components/education/AgentGatewayPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { AgentGatewayContent } from './educationContent';

export default function AgentGatewayPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'overview',
      label: 'Pattern overview',
      content: <AgentGatewayContent />,
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
