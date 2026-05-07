/**
 * Helix LLM Service
 *
 * Calls a published Helix agent via the conversation API:
 *   1. POST /environments/{env_id}/agents/{agent_name}/conversations  → {id, home_channel}
 *   2. POST /environments/{env_id}/conversations/{id}/channels/{ch}/messages  (send prompt)
 *   3. GET  (poll same URL) until a message with class=complete appears
 *
 * Auth: x-api-key header — NOT Authorization: Bearer.
 * Base URL: helix_base_url may be the tenant root (https://openam-helix.forgeblocks.com)
 * or the full API base (…/dpc/jas/helix/v1) — both are normalised internally.
 */

const HELIX_PATH = '/dpc/jas/helix/v1';

// Always use just the origin — strip any console/UI path the user may have copied.
function apiBase(baseUrl) {
  try {
    return new URL(baseUrl).origin + HELIX_PATH;
  } catch {
    return baseUrl.replace(/\/$/, '').replace(/\/dpc\/.*$/, '') + HELIX_PATH;
  }
}

/**
 * @param {object} config
 * @param {string} config.helix_base_url        - Tenant root or full API base URL
 * @param {string} config.helix_api_key         - Goes in x-api-key header
 * @param {string} config.helix_environment_id  - Helix environment/tenant ID
 * @param {string} config.helix_agent_id        - Agent name (string identifier, not a UUID)
 * @param {Array}  messages  - [{role:'user'|'system'|'assistant', content:'...'}]
 * @returns {Promise<string>}
 */
async function callHelixAgent(config, messages) {
  const { helix_base_url, helix_api_key, helix_environment_id, helix_agent_id } = config;

  const missing = [];
  if (!helix_base_url) missing.push('helix_base_url');
  if (!helix_api_key) missing.push('helix_api_key');
  if (!helix_environment_id) missing.push('helix_environment_id');
  if (!helix_agent_id) missing.push('helix_agent_id');
  if (missing.length) throw new Error(`Helix config incomplete: missing ${missing.join(', ')}`);
  if (!messages || messages.length === 0) throw new Error('No messages provided to Helix agent');

  const base = apiBase(helix_base_url);
  const hdrs = { 'Content-Type': 'application/json', 'x-api-key': helix_api_key };

  // Extract the last user/human message as the prompt
  const lastUser = [...messages].reverse().find((m) => m.role === 'user' || m.role === 'human')
    || messages[messages.length - 1];
  const prompt = typeof lastUser.content === 'string' ? lastUser.content : String(lastUser.content ?? '');

  // Step 1 — create conversation
  const convRes = await fetch(
    `${base}/environments/${helix_environment_id}/agents/${helix_agent_id}/conversations`,
    { method: 'POST', headers: hdrs, body: JSON.stringify({ name: `bx-${Date.now()}` }) },
  );
  if (!convRes.ok) {
    throw new Error(`Helix createConversation failed: ${convRes.status} ${await convRes.text()}`);
  }
  const conv = await convRes.json();
  const { id: conversationId, home_channel: channelId } = conv;

  // Step 2 — send prompt
  const msgRes = await fetch(
    `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ class: 'start', content: { textInputUserQuery: prompt } }),
    },
  );
  if (!msgRes.ok) {
    throw new Error(`Helix sendMessage failed: ${msgRes.status} ${await msgRes.text()}`);
  }

  // Step 3 — poll for completion
  const pollUrl = `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`;
  const deadline = Date.now() + 30_000;
  const interval = 1_500;

  while (Date.now() < deadline) {
    const pollRes = await fetch(pollUrl, { headers: { 'x-api-key': helix_api_key } });
    if (!pollRes.ok) {
      throw new Error(`Helix poll failed: ${pollRes.status} ${await pollRes.text()}`);
    }
    const data = await pollRes.json();
    const msgs = Array.isArray(data) ? data : (data.messages ?? data.content ?? []);
    const done = msgs.find(
      (m) => m.class === 'complete' && (m.sender_role === 'agent' || m.sender_id === helix_agent_id),
    );
    if (done?.value) {
      // Some agents return JSON string in value — unwrap if present
      try {
        const parsed = JSON.parse(done.value);
        if (typeof parsed?.response === 'string') return parsed.response;
      } catch { /* not JSON — use raw string */ }
      return done.value;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error('Timed out waiting for Helix response');
}

module.exports = { callHelixAgent };
