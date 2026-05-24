// banking_api_server/services/agentModeResolver.js
/**
 * Single SSOT mapping the user-facing agent MODE to the low-level
 * primitives (LLM provider, heuristic ROUTING on/off, external wiring).
 *
 * ARCHITECTURE-TRUTHS T-3 (amended): the heuristic ROUTING fast-path is
 * mode-dependent. Server-side transfer/HITL/Authorize enforcement is
 * INDEPENDENT of mode and is NOT affected here (see REGRESSION_PLAN §1).
 *
 * provider values feed llmProviderResolver unchanged (it stays the
 * single low-level resolver). heuristicRouting maps onto the existing
 * ff_heuristic_enabled primitive. externalWiring is 'bff' | 'platform'
 * for modes 4/5 only (null otherwise).
 */
const AGENT_MODES = [
  { id: 'heuristics',       label: 'Heuristics only',          provider: null,        heuristicRouting: true,  external: false },
  { id: 'helix_google',     label: 'Helix only',               provider: 'helix',     heuristicRouting: false, external: true  },
  { id: 'heuristics_helix', label: 'Heuristics + Helix',       provider: 'helix',     heuristicRouting: true,  external: false },
  { id: 'chatgpt',          label: 'Just ChatGPT',             provider: 'openai',    heuristicRouting: false, external: true },
  { id: 'claude',           label: 'Just Claude',              provider: 'anthropic', heuristicRouting: false, external: true },
];

const DEFAULT_MODE = 'heuristics_helix'; // = today's default behaviour

function resolveAgentMode(modeId, externalWiring) {
  const found = AGENT_MODES.find((m) => m.id === modeId);
  const m = found || AGENT_MODES.find((x) => x.id === DEFAULT_MODE);
  return {
    mode: m.id,
    provider: m.provider,
    heuristicRouting: m.heuristicRouting,
    externalWiring: m.external ? (externalWiring === 'platform' ? 'platform' : 'bff') : null,
  };
}

module.exports = { resolveAgentMode, AGENT_MODES, DEFAULT_MODE };
