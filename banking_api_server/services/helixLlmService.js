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

  // TODO: Replace this stub with real Helix API call once endpoint format is confirmed.
  //
  // Expected call pattern (from Helix Postman collection):
  //   POST {helix_base_url}/api/environments/{helix_environment_id}/agents/{helix_agent_id}/invoke
  //   Headers: {
  //     'Authorization': 'Bearer {helix_api_key}',
  //     'Content-Type': 'application/json'
  //   }
  //   Body: {
  //     messages: [
  //       { role: 'user|system|assistant', content: '...' }
  //     ]
  //   }
  //   Response: { response: 'agent output text', ... }
  //
  // Steps to implement:
  // 1. Confirm endpoint URL format and path from Helix Postman collection
  // 2. Confirm auth header format (Bearer vs X-API-Key vs custom)
  // 3. Confirm request/response body shapes
  // 4. Implement fetch call with proper error handling
  // 5. Test with real Helix credentials
  // 6. Remove this TODO

  throw new Error(
    'Helix LLM integration stub — please configure the real endpoint URL in helixLlmService.js ' +
    'once Helix API format is confirmed via the Postman collection. ' +
    'Stub location: banking_api_server/services/helixLlmService.js'
  );
}

module.exports = { callHelixAgent };
