// banking_api_ui/src/components/education/IntrospectionPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';
import { IntrospectionContent } from './educationContent';

export default function IntrospectionPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'why',
      label: 'What & Why',
      content: <IntrospectionContent />,
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Token introspection (RFC 7662)"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
