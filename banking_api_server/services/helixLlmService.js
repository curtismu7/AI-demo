/**
 * Helix LLM Service
 *
 * Calls a published Helix agent via the conversation API:
 *   1. POST /environments/{env_id}/agents/{agent_name}/conversations
 *      Body must include { agent: { version: 'published' } } — required by Helix, omitting it returns null.
 *   2. POST /environments/{env_id}/conversations/{id}/channels/{home_channel}/messages
 *      Content-Type must be "application/json; async=false"
 *   3. Poll GET same messages URL; response is an array — find message whose id differs from posted message id.
 *
 * Auth: x-api-key header (NOT Authorization: Bearer).
 */

const fs = require('fs');

const HELIX_PATH = '/dpc/jas/helix/v1';
const HELIX_LOG = process.env.HELIX_LOG_FILE || '/tmp/bank-helix.log';

let _appEvents;
function logHelix(severity, message, metadata) {
  const ts = new Date().toISOString();
  const meta = metadata ? ' ' + JSON.stringify(metadata) : '';
  const line = `${ts} [helix/${severity}] ${message}${meta}\n`;

  // Write to dedicated log file for tail -f
  try { fs.appendFileSync(HELIX_LOG, line); } catch (writeErr) { console.warn('[helixLlmService] log write failed:', writeErr.message); }

  // Publish to structured event ring buffer
  if (!_appEvents) {
    try { _appEvents = require('./appEventService'); } catch (_) { return; }
  }
  _appEvents.logEvent('helix', severity, message, { tag: 'helix/llm', metadata: metadata });
}

// Always use just the origin — strip any console/UI path the user may have copied.
function apiBase(baseUrl) {
  try {
    return new URL(baseUrl).origin + HELIX_PATH;
  } catch {
    return baseUrl.replace(/\/$/, '').replace(/\/dpc\/.*$/, '') + HELIX_PATH;
  }
}

/**
 * Extract text value from a Helix response message.
 * Messages can be a plain object or an array; look for class:"complete" or just grab .value.
 */
function extractValue(data) {
  // Array of messages — find the agent's completed message
  const items = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : [data]);
  const done = items.find((m) => m && (m.class === 'complete' || m.message_class === 'complete') && m.value != null);
  const raw = done?.value ?? null;
  if (raw == null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.response === 'string') return parsed.response;
  } catch { /* not JSON — use raw */ }
  return raw;
}

/**
 * @param {object} config
 * @param {string} config.helix_base_url
 * @param {string} config.helix_api_key
 * @param {string} config.helix_environment_id
 * @param {string} config.helix_agent_id
 * @param {string} config.helix_prompt_field_id
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
  const apiKey = helix_api_key;

  const lastUser = [...messages].reverse().find((m) => m.role === 'user' || m.role === 'human')
    || messages[messages.length - 1];
  const userText = typeof lastUser.content === 'string' ? lastUser.content : String(lastUser.content ?? '');

  // Helix directive field is not always active in published agents.
  // Prepend any system message so the LLM receives the full instruction context.
  const systemMsg = messages.find((m) => m.role === 'system');
  const systemText = systemMsg ? (typeof systemMsg.content === 'string' ? systemMsg.content : String(systemMsg.content ?? '')) : '';
  const prompt = systemText ? `${systemText}\n\n${userText}` : userText;

  logHelix('info', 'Helix call started', { agent: helix_agent_id, environment: helix_environment_id });

  // Step 1 — create conversation
  // IMPORTANT: body must include agent.version or Helix returns null
  const convRes = await fetch(
    `${base}/environments/${helix_environment_id}/agents/${helix_agent_id}/conversations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ agent: { version: 'published' } }),
    },
  );
  if (!convRes.ok) {
    const errText = await convRes.text();
    logHelix('error', `createConversation failed: ${convRes.status}`, { status: convRes.status, body: errText });
    throw new Error(`Helix createConversation failed: ${convRes.status} ${errText}`);
  }
  const conv = await convRes.json();
  if (!conv || !conv.id) {
    logHelix('error', 'createConversation returned null — check agent name, key scope, and published version', { agent: helix_agent_id });
    throw new Error(`Helix createConversation returned null — check agent name, key scope, and agent version`);
  }
  const { id: conversationId, home_channel: channelId } = conv;
  logHelix('info', 'Conversation created', { conversationId: conversationId, channelId: channelId });

  // Step 2 — post message
  // Content-Type must include async=false per Helix API spec
  const msgRes = await fetch(
    `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; async=false', 'x-api-key': apiKey },
      body: JSON.stringify({ class: 'start', content: { [helix_prompt_field_id]: prompt } }),
    },
  );
  if (!msgRes.ok) {
    const errText = await msgRes.text();
    logHelix('error', `sendMessage failed: ${msgRes.status}`, { status: msgRes.status, body: errText });
    throw new Error(`Helix sendMessage failed: ${msgRes.status} ${errText}`);
  }
  const msgData = await msgRes.json();
  const queryMessageId = msgData?.message_id || msgData?.id;

  // Check if POST response already contains the answer
  const immediate = extractValue(msgData);
  if (immediate != null) {
    logHelix('info', 'Response received (immediate)', { conversationId: conversationId });
    return immediate;
  }
  logHelix('info', 'Polling for response', { conversationId: conversationId });

  // Step 3 — poll for agent response
  const pollUrl = `${base}/environments/${helix_environment_id}/conversations/${conversationId}/channels/${channelId}/messages`;
  const deadline = Date.now() + 30_000;
  const interval = 1_000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const pollRes = await fetch(pollUrl, { headers: { 'x-api-key': apiKey } });
    if (!pollRes.ok) {
      const errText = await pollRes.text();
      logHelix('error', `poll failed: ${pollRes.status}`, { status: pollRes.status, body: errText });
      throw new Error(`Helix poll failed: ${pollRes.status} ${errText}`);
    }
    const data = await pollRes.json();

    // Filter out the message we posted — look for the agent's reply
    // Poll response uses message_id (not id); agent messages have sender_role:"agent"
    const messages_ = Array.isArray(data) ? data : [];
    const agentMsg = messages_.find((m) =>
      m.sender_role === 'agent' &&
      m.message_id !== queryMessageId &&
      m.value != null
    );
    if (agentMsg) {
      const result = extractValue(agentMsg);
      if (result != null) {
        logHelix('info', 'Response received (poll)', { conversationId: conversationId });
        return result;
      }
    }

    // Also check top-level if response isn't an array
    const result = extractValue(data);
    if (result != null) {
      logHelix('info', 'Response received (poll/top-level)', { conversationId: conversationId });
      return result;
    }
  }

  logHelix('error', 'Timed out waiting for Helix response', { conversationId: conversationId, agent: helix_agent_id });
  throw new Error('Timed out waiting for Helix response');
}

module.exports = { callHelixAgent };
