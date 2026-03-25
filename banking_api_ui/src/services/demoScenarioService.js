// banking_api_ui/src/services/demoScenarioService.js

function apiError(res, data) {
  const err = new Error(data.message || data.error || `HTTP ${res.status}`);
  err.code = data.error;
  err.status = res.status;
  return err;
}

export async function fetchDemoScenario() {
  const res = await fetch('/api/demo-scenario', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res, data);
  return data;
}

export async function saveDemoScenario(body) {
  const res = await fetch('/api/demo-scenario', {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(res, data);
  return data;
}

/**
 * Persists floating vs embedded agent layout to the signed-in user's demo scenario (KV when configured).
 * No-op on failure (e.g. 401 on /config while logged out). Does not throw.
 * @param {'floating' | 'embedded'} mode
 */
export async function persistBankingAgentUiMode(mode) {
  const m = mode === 'embedded' ? 'embedded' : 'floating';
  try {
    const res = await fetch('/api/demo-scenario', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankingAgentUiMode: m }),
    });
    if (!res.ok && res.status !== 401) {
      await res.json().catch(() => ({}));
    }
  } catch {
    // ignore network errors
  }
}
