/**
 * Helix LLM Service
 *
 * Integrates Ping's Helix AI platform as a language model provider.
 * Currently a stub that throws a clear error — to be replaced with real API call
 * once endpoint format is confirmed via Helix Postman collection.
 */

/**
 * Call Helix agent with a message
 *
 * @param {object} config - Helix configuration
 * @param {string} config.helix_base_url - Helix tenant URL (e.g. https://openam-helix.forgeblocks.com)
 * @param {string} config.helix_api_key - API Key from Helix Admin section
 * @param {string} config.helix_environment_id - Helix environment/tenant ID
 * @param {string} config.helix_agent_id - The agent to invoke
 * @param {Array} messages - LangChain message list [{role: 'system|user|assistant', content: '...'}]
 * @returns {Promise<string>} Response text from Helix agent
 */
async function callHelixAgent(config, messages) {
  const { helix_base_url, helix_api_key, helix_environment_id, helix_agent_id } = config;

  // Validation
  const missing = [];
  if (!helix_base_url) missing.push('helix_base_url');
  if (!helix_api_key) missing.push('helix_api_key');
  if (!helix_environment_id) missing.push('helix_environment_id');
  if (!helix_agent_id) missing.push('helix_agent_id');

  if (missing.length > 0) {
    throw new Error(`Helix config incomplete: missing ${missing.join(', ')}`);
  }

  if (!messages || messages.length === 0) {
    throw new Error('No messages provided to Helix agent');
  }

  const url = `${helix_base_url}/api/environments/${helix_environment_id}/agents/${helix_agent_id}/invoke`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout for Helix

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${helix_api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Helix HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    const responseText = data?.response || data?.message || data?.content || '';
    if (!responseText) {
      throw new Error('Helix returned empty response');
    }

    return responseText;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { callHelixAgent };
