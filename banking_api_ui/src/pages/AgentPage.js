import React from 'react';
import BankingAgent from '../components/BankingAgent';

/**
 * Full-page inline agent view — same functionality as the floating widget but
 * laid out like a native chat page (Claude-style).  The BankingAgent component
 * handles all state; this page simply mounts it in "inline" mode so it fills
 * the content area instead of floating over it.
 */
export default function AgentPage({ user, onLogout }) {
  return (
    <div className="agent-page">
      <BankingAgent user={user} onLogout={onLogout} mode="inline" />
    </div>
  );
}
