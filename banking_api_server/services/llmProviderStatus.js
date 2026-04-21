/**
 * LLM Provider Status Service
 *
 * Checks Ollama provider availability by:
 * 1. Attempting a lightweight health check (≤3 second timeout)
 * 2. Returning status: 'available' | 'unreachable'
 */

/**
 * Get provider availability status
 *
 * @param {string} provider - Provider name (only 'ollama' supported)
 * @param {object} config - Config object with provider settings
 * @returns {Promise<{status: string, reason: string, hasKey: boolean, isReachable: boolean}>}
 */
async function getProviderStatus(provider, config = {}) {
  const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds

  if (provider !== 'ollama') {
    return { status: 'unconfigured', reason: `Provider "${provider}" not supported — only Ollama is available`, hasKey: false, isReachable: false };
  }

  const ollamaBase = config.ollama_base_url || 'http://localhost:11434';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${ollamaBase}/api/tags`, {
      signal: controller.signal,
      timeout: HEALTH_CHECK_TIMEOUT,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { status: 'available', reason: 'Ollama server reachable', hasKey: true, isReachable: true };
    } else {
      return { status: 'unreachable', reason: `Ollama health check failed: ${response.status}`, hasKey: true, isReachable: false };
    }
  } catch (error) {
    return {
      status: 'unreachable',
      reason: `Ollama connection failed: ${error.message || 'timeout'}`,
      hasKey: true,
      isReachable: false,
    };
  }
}

module.exports = { getProviderStatus };
