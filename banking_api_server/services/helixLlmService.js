/**
 * Helix LLM Service
 *
 * Calls a published Helix agent via the conversation API:
 *   1. POST /environments/{env_id}/agents/{agent_name}/conversations  → {id, home_channel}
 *   2. POST /environments/{env_id}/conversations/{id}/channels/{home_channel}/messages
 *      → response contains message_class:"complete" with content[] array directly
 *
 * Auth: x-api-key header — NOT Authorization: Bearer.
 * Base URL: helix_base_url may be the tenant root (https://openam-helix.forgeblocks.com)
 * or the full API base (…/dpc/jas/helix/v1) — both are normalised internally.
 *
 * helix_prompt_field_id: the agent-specific input field ID (e.g. "textInput5caa33a55f06").
 * Find it in the Helix agent designer — it's the ID of the text input node connected to the prompt.
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
 * Extract the text response from a Helix messages response body.
 * The response has a top-level content[] array; the completed item has class:"complete" and a value field.
 */
function extractHelixResponse(data) {
  // Top-level message_class:"complete" with content array
  const items = Array.isArray(data.content) ? data.content : [];
  const done = items.find((m) => m.class === 'complete' && m.value != null);
  if (done?.value) {
    try {
      const parsed = JSON.parse(done.value);
      if (typeof parsed?.response === 'string') return parsed.response;
    } catch { /* not JSON — use raw string */ }
    return done.value;
  }
  return null;
}

/**
 * @param {object} config
 * @param {string} config.helix_base_url        - Tenant root or full API base URL
 * @param {string} config.helix_api_key         - Goes in x-api-key header
 * @param {string} config.helix_environment_id  - Helix environment/tenant ID
 * @param {string} config.helix_agent_id        - Agent name (string identifier, not a UUID)
 * @param {string} [config.helix_prompt_field_id] - Input field ID from the agent designer (e.g. "textInput5caa33a55f06")
 * @param {Array}  messages  - [{role:'user'|'system'|'assistant', content:'...'}]
 * @returns {Promise<string>}
 */
async function callHelixAgent(config, messages) {
  const { helix_base_url, helix_api_key, helix_environment_id, helix_agent_id, helix_prompt_field_id } = config;

  const missing = [];
  if (!helix_base_url) missing.push('helix_base_url');
  if (!helix_api_key) missing.push('helix_api_key');
  if (!helix_environment_id) missing.push('helix_environment_id');
  if (!helix_agent_id) missing.push('helix_agent_id');
  if (!helix_prompt_field_id) missing.push('helix_prompt_field_id');
  if (missing.length) throw new Error(`Helix config incomplete: missing ${missing.join(', ')}`);
  if (!messages || messages.length === 0) throw new Error('No messages provided to Helix agent');

  const base = apiBase(helix_base_url);
  const hdrs = { 'Content-Type': 'application/json', 'x-api-key': helix_api_key };

  // Extract the last user/human message as the prompt
  const lastUser = [...messages].reverse().find((m) => m.role === 'user' || m.role === 'human')
    || messages[messages.length - 1];
  const prompt = typeof lastUser.content === 'string' ? lastUser.content : String(lastUser.content ?? '');

  // Step 1 — create conversation → returns { id, home_channel }
  const convRes = await fetch(
    `${base}/environments/${helix_environment_id}/agents/${helix_agent_id}/conversations`,
    { method: 'POST', headers: hdrs, body: JSON.stringify({ name: `bx-${Date.now()}` }) },
  );
  if (!convRes.ok) {
    throw new Error(`Helix createConversation failed: ${convRes.status} ${await convRes.text()}`);
  }
  const conv = await convRes.json();
  const { id: conversationId, home_channel: channelId } = conv;

  const promptFieldId = helix_prompt_field_id;

  // Step 2 — send prompt; response includes the completed answer directly
  const msgRes = await fetch(
    `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: hdrs,
      body: JSON.stringify({ class: 'start', content: { [promptFieldId]: prompt } }),
    },
  );
  if (!msgRes.ok) {
    throw new Error(`Helix sendMessage failed: ${msgRes.status} ${await msgRes.text()}`);
  }
  const msgData = await msgRes.json();

  // The POST response contains the answer when message_class === "complete"
  if (msgData.message_class === 'complete') {
    const result = extractHelixResponse(msgData);
    if (result != null) return result;
  }

  // Fallback: poll if the response wasn't immediately complete
  const pollUrl = `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`;
  const deadline = Date.now() + 30_000;
  const interval = 1_500;

  while (Date.now() < deadline) {
    const pollRes = await fetch(pollUrl, { headers: { 'x-api-key': helix_api_key } });
    if (!pollRes.ok) {
      throw new Error(`Helix poll failed: ${pollRes.status} ${await pollRes.text()}`);
    }
    const data = await pollRes.json();
    if (data.message_class === 'complete') {
      const result = extractHelixResponse(data);
      if (result != null) return result;
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error('Timed out waiting for Helix response');
}

module.exports = { callHelixAgent };
