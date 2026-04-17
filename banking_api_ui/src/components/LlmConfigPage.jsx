import React from 'react';
import AdminLayout from './AdminLayout';
import LlmConfigPanel from './LlmConfigPanel';

/**
 * LlmConfig Page — LLM provider configuration
 *
 * Wrapped in AdminLayout for admin-only access with sidebar navigation.
 */
export default function LlmConfigPage({ user, onLogout }) {
  return (
    <AdminLayout>
      <div className="page-container">
        <LlmConfigPanel />
      </div>
    </AdminLayout>
  );
}
