/**
 * LLM Provider Status Service
 *
 * Checks provider availability by:
 * 1. Verifying API key is configured
 * 2. Attempting a lightweight health check (≤3 second timeout)
 * 3. Returning status: 'available' | 'unconfigured' | 'unreachable'
 */

/**
 * Get provider availability status
 *
 * @param {string} provider - Provider name (groq, openai, anthropic, google, ollama)
 * @param {object} config - Config object with provider settings
 * @returns {Promise<{status: string, reason: string, hasKey: boolean, isReachable: boolean}>}
 */
async function getProviderStatus(provider, config = {}) {
  const HEALTH_CHECK_TIMEOUT = 3000; // 3 seconds

  // Map of provider to config key
  const keyMap = {
    groq: 'groq_api_key',
    openai: 'openai_api_key',
    anthropic: 'anthropic_api_key',
    google: 'google_api_key',
    ollama: null, // Ollama uses base URL, not API key
  };

  const apiKey = config[keyMap[provider]];
  const hasKey = !!apiKey;

  // Ollama doesn't require an API key — it uses a base URL
  if (provider === 'ollama') {
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
        status: error.name === 'AbortError' ? 'unreachable' : 'unreachable',
        reason: `Ollama connection failed: ${error.message || 'timeout'}`,
        hasKey: true,
        isReachable: false,
      };
    }
  }

  // For other providers, check if API key is configured
  if (!hasKey) {
    return { status: 'unconfigured', reason: 'API key not configured', hasKey: false, isReachable: false };
  }

  // Attempt lightweight health check (3s timeout)
  try {
    let url;
    const headers = {};

    // Build health check request per provider
    switch (provider) {
      case 'groq':
        url = 'https://api.groq.com/openai/v1/models';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'openai':
        url = 'https://api.openai.com/v1/models';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'anthropic':
        url = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'google':
        // Google uses parameter-based auth; just test endpoint existence
        url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        break;
      default:
        return { status: 'unconfigured', reason: 'Unknown provider', hasKey: false, isReachable: false };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Provider is reachable if we get any response (auth errors still indicate server is up)
    const isReachable = response.status !== 404 && response.status !== 502 && response.status !== 503;

    if (isReachable && response.ok) {
      return { status: 'available', reason: 'Provider is reachable and configured', hasKey: true, isReachable: true };
    } else if (isReachable && (response.status === 401 || response.status === 403)) {
      // Auth error means server is up, but key is invalid
      return { status: 'unreachable', reason: 'API key is invalid or expired', hasKey: true, isReachable: false };
    } else {
      return {
        status: 'unreachable',
        reason: `Health check failed: HTTP ${response.status}`,
        hasKey: true,
        isReachable: false,
      };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { status: 'unreachable', reason: 'Health check timeout (>3s)', hasKey: true, isReachable: false };
    }
    return { status: 'unreachable', reason: `Health check error: ${error.message}`, hasKey: true, isReachable: false };
  }
}

module.exports = { getProviderStatus };
