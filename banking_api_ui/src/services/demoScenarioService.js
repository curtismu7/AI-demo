// banking_api_ui/src/services/demoScenarioService.js

function apiError(res, data) {
  const err = new Error(data.message || data.error || `HTTP ${res.status}`);
  err.code = data.error;
  err.status = res.status;
  return err;
}

/** Coalesce concurrent GETs (React Strict Mode double-mount, multiple listeners). */
let fetchDemoScenarioInflight = null;

export async function fetchDemoScenario() {
  if (fetchDemoScenarioInflight) {
    return fetchDemoScenarioInflight;
  }
  fetchDemoScenarioInflight = (async () => {
    try {
      const res = await fetch('/api/demo-scenario', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw apiError(res, data);
      return data;
    } finally {
      fetchDemoScenarioInflight = null;
    }
  })();
  return fetchDemoScenarioInflight;
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
 * Does not throw. Returns whether the server accepted the update (false on network error or non-OK response).
 * @param {'floating' | 'embedded'} mode
 * @returns {Promise<boolean>}
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
    if (!res.ok) {
      if (res.status !== 401) await res.json().catch(() => ({}));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
