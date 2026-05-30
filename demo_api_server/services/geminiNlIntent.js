// banking_api_server/services/geminiNlIntent.js
/**
 * Intent parsing — priority: HEURISTIC (instant) → Ollama (local LLM fallback).
 * Heuristic handles all known commands (accounts, balance, transfer, education topics) with zero latency.
 * Ollama is only called when heuristic returns kind:'none' (unrecognized input).
 */
'use strict';

const path = require('node:path');
const { parseHeuristic, EDU, resolveActiveVerticalCtx } = require('./nlIntentParser');
const { sanitizeNlResult } = require('./nlIntentSanitize');
const { callHelixAgent } = require('./helixLlmService');
const configStore = require('./configStore');
const { verticalManifest } = require('./verticalManifest');
const verticalDispatch = require('./verticalDispatch');

const { base: SYSTEM_BASE, themes: THEME_OVERRIDES } =
  require(path.join(__dirname, '../../docs/HELIX_AGENT_DIRECTIVES.json'));

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const OLLAMA_TIMEOUT_MS = 10000;

console.log(`[NL Intent] LLM config: model=${OLLAMA_MODEL} url=${OLLAMA_BASE_URL} timeout=${OLLAMA_TIMEOUT_MS}ms`);


function buildSystem(vertical) {
  // Plugin-first: a vertical with an index.js owns its full directive.
  if (verticalDispatch.hasPlugin(vertical)) {
    return verticalDispatch.systemPromptFor(vertical, {}, () => '');
  }
  // Legacy (no plugin yet): base + per-vertical theme override.
  const override = THEME_OVERRIDES[vertical] || '';
  return SYSTEM_BASE + override;
}

function buildSystemWithCtx(vertical, context) {
  const SYSTEM = verticalDispatch.hasPlugin(vertical)
    ? verticalDispatch.systemPromptFor(vertical, context, () => '')
    : buildSystem(vertical);
  if (!context.role) return SYSTEM;
  // Use vertical-neutral phrasing. The previous wording said "Admin users can
  // query ALL accounts" / "banking actions apply to their own accounts" — both
  // surfaced banking terminology AFTER the theme override, which directly
  // contradicted overrides like healthcare/retail/sporting-goods that
  // explicitly instruct "never surface banking terminology". The LLM weighs
  // later instructions more heavily, so the role note was undoing the
  // theme. Neutral wording lets the active theme stay authoritative.
  const roleNote = context.role === 'admin'
    ? 'This user has admin privileges and can query data across all users.'
    : 'This is a regular signed-in user — queries apply to their own data only.';
  return `${SYSTEM}\n\nSigned-in user: role=${context.role}${context.firstName ? `, name=${context.firstName}` : ''}. ${roleNote}`;
}


/**
 * Answer a general knowledge question using Helix when banking intent parsing fails.
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} education result with markdown answer or null
 */
async function answerWithHelix(userMessage, context = {}) {
  try {
    // Use getEffective so committed FIELD_DEFS defaults (base_url, env_id,
    // agent_id, prompt_field_id) work for fresh clones with empty SQLite.
    // helix_api_key must still be supplied by the operator.
    const helixConfig = {
      helix_base_url: configStore.getEffective('helix_base_url'),
      helix_api_key: configStore.getEffective('helix_api_key'),
      helix_environment_id: configStore.getEffective('helix_environment_id'),
      helix_agent_id: configStore.getEffective('helix_agent_id'),
      helix_prompt_field_id: configStore.getEffective('helix_prompt_field_id'),
    };

    // Check if Helix is configured
    if (!helixConfig.helix_base_url || !helixConfig.helix_api_key) {
      console.warn('[nlIntent] Helix not configured');
      return null;
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a knowledgeable assistant for a banking demo platform. Answer the user\'s question concisely and accurately. Keep your answer to 1-2 paragraphs.',
      },
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const answer = await callHelixAgent(helixConfig, messages);
    if (answer) {
      return {
        kind: 'education',
        education: { panel: 'general-knowledge' },
        message: answer,
      };
    }
  } catch (err) {
    console.warn('[nlIntent] Helix error:', err.message);
  }
  return null;
}

/**
 * @param {string} userMessage
 * @param {{ role?: string, firstName?: string }} [context]
 * @returns {Promise<object|null>} parsed result object or null to fall through
 */
async function parseWithOllama(userMessage, context = {}, vertical = 'banking') {
  const systemWithCtx = buildSystemWithCtx(vertical, context);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemWithCtx },
          { role: 'user', content: userMessage },
        ],
        stream: false,
        options: { temperature: 0.1 },
        format: 'json',
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn('[nlIntent] Ollama HTTP', res.status);
      return null;
    }

    const data = await res.json();
    const text = data?.message?.content;
    if (!text) return null;

    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && parsed.kind) return parsed;
  } catch (e) {
    if (e.name === 'AbortError') {
      console.warn('[nlIntent] Ollama timeout (%dms) — skipping', OLLAMA_TIMEOUT_MS);
    } else {
      console.warn('[nlIntent] Ollama error:', e.message);
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

/**
 * @param {string} message
 * @param {{ role?: string, firstName?: string }} [context] - user context for role-aware routing
 * @param {string} [provider='auto'] - 'auto' (heuristic→helix), 'ollama' (skip heuristic, requires Ollama configured), 'helix'. See llmProviderResolver.
 * @returns {Promise<{ source: 'ollama'|'heuristic'|'helix'|'helix_fallback', result: object }>}
 */
async function parseNaturalLanguage(message, context = {}, provider = 'auto', langchainConfig = {}) {
  // 1. HEURISTIC ALWAYS RUNS as a deterministic safety net (zero latency).
  // ff_heuristic_enabled=false (the agent UI's "LLM only" toggle) means "prefer LLM",
  // not "disable heuristic" — if every LLM falls through, we still want the heuristic
  // answer instead of a canned "I didn't catch that" UI fallback.
  const heuristicEnabled = configStore.getEffective('ff_heuristic_enabled') !== 'false';
  // Set true once any LLM router call has been made, so heuristic-floor returns
  // reached after the LLM falls through still report llm_attempted to the UI.
  let llmAttempted = false;
  const activeVertical = verticalManifest.resolver.activeId();
  const _verticalCtx = resolveActiveVerticalCtx();
  const heuristicResult = parseHeuristic(message, activeVertical, _verticalCtx);

  // Single concise log per /nl call — vertical + message preview + provider.
  // Surfaces in /tmp/demo-api.log for post-hoc diagnosis of routing decisions.
  const msgPreview = String(message || '').slice(0, 60).replace(/\s+/g, ' ');
  const startedAt = Date.now();
  /** Internal: log + return the resolved decision in one line. */
  function logAndReturn(out) {
    const action = out?.result?.banking?.action
      || (out?.result?.kind === 'education' ? `edu:${out.result.education?.panel || 'unknown'}` : null)
      || out?.result?.kind || 'unknown';
    const ms = Date.now() - startedAt;
    console.log(
      `[nlIntent] vertical=${activeVertical || 'none'} provider=${provider} source=${out.source} `
      + `action=${action} ms=${ms} msg="${msgPreview}"`
    );
    return out;
  }

  // provider:"heuristic" = heuristic-only mode (Quick Action chips, no LLM configured).
  // Skip LLM entirely — return immediately with heuristic result whatever it is.
  if (provider === 'heuristic') {
    return { source: 'heuristic', result: heuristicResult };
  }

  // provider:"pingone-admin" = PingOne MCP Admin chip — skip heuristic, go straight to Helix.
  if (provider === 'pingone-admin') {
    const { resolveLlmProvider } = require('./llmProviderResolver');
    const { provider: llmProvider } = resolveLlmProvider(langchainConfig);
    if (llmProvider !== 'helix') {
      return {
        source: 'heuristic',
        result: { kind: 'none', message: 'PingOne Admin tools require Helix to be configured. Open the Helix tab in the agent and add base_url + api_key + agent_id.' },
        llm_attempted: false,
        llm_not_configured: true,
      };
    }
    // Fall through with selectedProvider forced to 'helix' below.
  }

  // agent_mode controls heuristicRouting per the five-mode spec.
  // When mode is helix_google (Helix only), bypass the heuristic fast-return
  // so the LLM path is always taken — matching heuristicRouting:false in agentModeResolver.
  const { resolveAgentMode } = require('./agentModeResolver');
  const rawAgentMode = configStore.getEffective('agent_mode');
  const resolvedAgentMode = rawAgentMode
    ? resolveAgentMode(rawAgentMode, configStore.getEffective('agent_external_wiring'))
    : null;
  const heuristicRoutingEnabled = resolvedAgentMode
    ? resolvedAgentMode.heuristicRouting
    : heuristicEnabled;

  if (provider !== 'pingone-admin' && heuristicRoutingEnabled && heuristicResult && heuristicResult.kind !== 'none') {
    return { source: 'heuristic', result: heuristicResult };
  }

  // 2. FALLBACK TO LLM — when heuristic doesn't recognize the input
  // Use configured provider (Helix, Ollama, etc.) based on langchainConfig
  const { resolveLlmProvider } = require('./llmProviderResolver');
  const selectedProvider = (provider === 'auto' || provider === 'pingone-admin')
    ? resolveLlmProvider(langchainConfig).provider
    : provider;

  // Try selected provider first for NL intent routing
  if (selectedProvider === 'helix') {
    const systemWithCtx = buildSystemWithCtx(activeVertical, context);

    try {
      // Use getEffective so FIELD_DEFS defaults reach fresh clones (see answerWithHelix).
      const helixConfig = {
        helix_base_url: langchainConfig.helix_base_url || configStore.getEffective('helix_base_url'),
        helix_api_key: langchainConfig.helix_api_key || configStore.getEffective('helix_api_key'),
        helix_environment_id: langchainConfig.helix_environment_id || configStore.getEffective('helix_environment_id'),
        helix_agent_id: langchainConfig.helix_agent_id || configStore.getEffective('helix_agent_id'),
        helix_prompt_field_id: langchainConfig.helix_prompt_field_id || configStore.getEffective('helix_prompt_field_id'),
      };

      // Check if Helix is configured
      if (!helixConfig.helix_base_url || !helixConfig.helix_api_key) {
        console.warn('[nlIntent] Helix not configured; falling back to Ollama');
        return { source: 'heuristic', result: heuristicResult, llm_attempted: false, llm_not_configured: true };
      } else {
        const helixResult = await callHelixAgent(helixConfig, [
          { role: 'system', content: systemWithCtx },
          { role: 'user', content: message },
        ]);

        const tryParse = (text) => {
          if (!text) return null;
          const cleaned = String(text).replace(/^```json\s*/i, '').replace(/```\s*$/m, '').trim();
          try {
            const parsed = JSON.parse(cleaned);
            if (parsed && typeof parsed === 'object' && parsed.kind && parsed.kind !== 'none') return parsed;
          } catch (e) {
            // not JSON — fall through to refusal-detection retry
          }
          return null;
        };

        let parsed = tryParse(helixResult);
        if (parsed) return logAndReturn({ source: 'helix', result: parsed });

        // Retry-on-refusal: when Helix returns prose (especially a refusal like
        // "I cannot fulfill that request"), nudge it to emit JSON and re-classify.
        // Detection is intentionally loose — any non-JSON response from a chip
        // phrase is a misclassification we want to fix.
        const looksLikeRefusal = helixResult &&
          /\b(cannot|can't|unable|won'?t|not able|do not have access|don't have access|this is a (banking )?demo|log in to your)\b/i.test(helixResult);
        if (helixResult && (looksLikeRefusal || !parsed)) {
          console.warn('[nlIntent] Helix returned non-JSON or refusal — retrying with explicit JSON-only nudge');
          const nudge = systemWithCtx +
            `\n\nRETRY NOTE: Your previous response was not valid JSON or was a refusal. ` +
            `You MUST output ONLY a JSON object matching one of the allowed shapes above. ` +
            `Do not refuse on privacy/demo grounds — the user is authenticated and tools work. ` +
            `If unsure, default to {"kind":"banking","banking":{"action":"spending_summary","params":{}}} ` +
            `for spending/category/percentage questions, {"action":"transactions","params":{}} for ` +
            `transaction lists, or {"action":"balance","params":{}} for balance questions.`;
          try {
            const retry = await callHelixAgent(helixConfig, [
              { role: 'system', content: nudge },
              { role: 'user', content: message },
            ]);
            parsed = tryParse(retry);
            if (parsed) return logAndReturn({ source: 'helix', result: parsed });
          } catch (e) {
            console.warn('[nlIntent] Helix retry failed:', e.message);
          }
        }
        // kind:'none' or still non-JSON — fall through to the conversational Helix
        // answer (LLM-only block below, or Ollama→answerWithHelix in heuristic mode).
        // Mark that the LLM was attempted so a final heuristic-floor return can tell
        // the UI "Helix couldn't map this" (BankingAgent.js) vs a never-tried fallback.
        llmAttempted = true;
      }
    } catch (err) {
      console.warn('[nlIntent] Helix error:', err.message);
      return { source: 'heuristic', result: heuristicResult, llm_attempted: true };
    }
  }

  // In LLM-only mode skip Ollama entirely — go straight to conversational Helix answer.
  if (!heuristicEnabled) {
    const helixAnswer = await answerWithHelix(message, context).catch((e) => {
      console.warn('[nlIntent] Helix conversational failed:', e.message);
      return null;
    });
    if (helixAnswer) {
      return logAndReturn({ source: 'helix_fallback', result: helixAnswer });
    }
    // LLM-only mode but no LLM produced an answer (e.g. Helix not configured,
    // network failure). Fall back to the heuristic so chips and known phrases
    // still work — never let a UI canned "I didn't catch that" win.
    if (heuristicResult && heuristicResult.kind !== 'none') {
      console.warn('[nlIntent] LLM-only mode: no LLM produced an answer — falling back to heuristic');
      return { source: 'heuristic', result: heuristicResult, llm_attempted: llmAttempted };
    }
    return { source: 'heuristic', result: heuristicResult, llm_attempted: llmAttempted };
  }

  // Heuristic mode: try Ollama for unrecognized input
  const ollama = await parseWithOllama(message, context, activeVertical).catch((e) => {
    console.warn('[nlIntent] Ollama error:', e.message);
    return null;
  });
  if (ollama) {
    const { result, rejected, reason } = sanitizeNlResult(ollama, message);
    if (rejected) console.warn('[nlIntent] Ollama output rejected → heuristic:', reason);
    return logAndReturn({ source: rejected ? 'heuristic' : 'ollama', result });
  }

  // 3. Try Helix for general knowledge questions when banking intent fails (fallback only)
  if (selectedProvider === 'helix' || (selectedProvider === 'auto' && langchainConfig?.provider === 'helix')) {
    const helixAnswer = await answerWithHelix(message, context).catch((e) => {
      console.warn('[nlIntent] Helix fallback failed:', e.message);
      return null;
    });
    if (helixAnswer) {
      return logAndReturn({ source: 'helix_fallback', result: helixAnswer });
    }
  }

  // 4. Final fallback: return whatever heuristic gave (recognized result or kind:none).
  // The heuristic always ran at step 1; if it produced kind:none, this is the canonical
  // "no LLM available and heuristic didn't match" outcome — the UI shows its canned hint.
  return { source: 'heuristic', result: heuristicResult, llm_attempted: llmAttempted };
}

module.exports = {
  parseNaturalLanguage,
  EDU,
  __test: { buildSystem, buildSystemWithCtx },
};
