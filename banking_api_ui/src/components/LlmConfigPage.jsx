import React from 'react';
import LlmConfigPanel from './LlmConfigPanel';

/**
 * LlmConfig Page — LLM provider configuration
 */
export default function LlmConfigPage({ user, onLogout }) {
  return (
    <div className="page-container">
      <LlmConfigPanel />
    </div>
  );
}
