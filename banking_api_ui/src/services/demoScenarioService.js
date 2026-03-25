// banking_api_ui/src/services/demoScenarioService.js

export async function fetchDemoScenario() {
  const res = await fetch('/api/demo-scenario', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
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
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}
