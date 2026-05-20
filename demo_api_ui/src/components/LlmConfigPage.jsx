import React from 'react';
import LlmConfigPanel from './LlmConfigPanel';
import HelixPanel from './HelixPanel';

/**
 * LlmConfig Page — LLM provider configuration
 */
export default function LlmConfigPage({ user, onLogout }) {
  return (
    <div className="page-container">
      <LlmConfigPanel />
      <HelixPanel />
    </div>
  );
}
