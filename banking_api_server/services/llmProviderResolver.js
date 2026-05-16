// banking_api_server/services/llmProviderResolver.js
/**
 * Single canonical LLM provider resolver (ARCHITECTURE-TRUTHS T-3).
 *
 * The heuristic is NOT a provider — it always runs upstream and is the
 * deterministic floor. This resolver is consulted only when the heuristic
 * did not answer.
 *
 * Rule: explicit langchainConfig.provider is honored; otherwise Helix.
 * 'ollama' is returned ONLY when explicitly selected AND configured
 * (an ollama_base_url is present, or OLLAMA_BASE_URL env is set). If
 * 'ollama' is selected but not configured, fall back to Helix — never a
 * dead Ollama call. No other module may inline a provider default.
 *
 * @param {{ provider?: string, model?: string, ollama_base_url?: string }} langchainConfig
 * @returns {{ provider: 'helix'|'ollama', model: string|undefined }}
 */
function resolveLlmProvider(langchainConfig = {}) {
  const requested = langchainConfig && langchainConfig.provider;
  const model = langchainConfig && langchainConfig.model;

  if (requested === 'ollama') {
    const configured =
      !!(langchainConfig && langchainConfig.ollama_base_url) ||
      !!process.env.OLLAMA_BASE_URL;
    if (configured) return { provider: 'ollama', model };
    return { provider: 'helix', model };
  }

  if (requested === 'helix') return { provider: 'helix', model };

  // No explicit provider, or an unknown one → Helix (the default LLM).
  return { provider: 'helix', model };
}

module.exports = { resolveLlmProvider };
