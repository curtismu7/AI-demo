// banking_api_ui/src/services/bankingAgentNlService.js
/**
 * Natural language routing for the Banking Agent (Backend-for-Frontend (BFF): heuristic + optional Gemini).
 */

import { refreshOAuthSession } from './bankingAgentService';

export async function fetchNlStatus() {
  const res = await fetch('/api/banking-agent/nl/status', { credentials: 'include' });
  if (!res.ok) return { geminiConfigured: false, heuristicAlwaysAvailable: true };
  return res.json();
}

/**
 * @param {string} message
 * @returns {Promise<{ source: string, result: object }>}
 */
export async function parseNaturalLanguage(message) {
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ message }),
  };
  let res = await fetch('/api/banking-agent/nl', opts);
  if (res.status === 401) {
    const refreshed = await refreshOAuthSession();
    if (refreshed.ok) {
      res = await fetch('/api/banking-agent/nl', opts);
    }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || data.error || `NL request failed (${res.status})`);
    err.statusCode = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}
