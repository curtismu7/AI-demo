// banking_api_ui/src/hooks/useLangchainProvider.js
//
// Shared single-source-of-truth for the agent LLM provider selection,
// consumed by three surfaces (Config page, BankingAgent header,
// UserDashboard toolbar) so they cannot drift out of sync. Teaching
// spec: docs/superpowers/specs/2026-05-18-chatgpt-claude-as-agent.
//
// Server is the SSOT (req.session.langchain_config, resolved through
// llmProviderResolver). This hook hydrates from
// GET  /api/langchain/config/status   and persists via
// POST /api/langchain/config. `key_set` from the status endpoint is
// honest (ollama always; helix when its creds set; openai/anthropic
// when the key the agent service actually uses is present) so callers
// can disable unconfigured options ("disable unconfigured" UX).
import { useCallback, useEffect, useState } from "react";

// The four providers we expose in the UI. groq/google exist server-side
// but are intentionally not surfaced (out of scope for this spec).
export const PROVIDER_OPTIONS = [
  { id: "helix", label: "Helix (model-agnostic wrapper)" },
  { id: "ollama", label: "Ollama (local)" },
  { id: "openai", label: "OpenAI (ChatGPT)" },
  { id: "anthropic", label: "Anthropic (Claude)" },
];

const STATUS_URL = "/api/langchain/config/status";
const SAVE_URL = "/api/langchain/config";

/**
 * @returns {{
 *   provider: string,
 *   model: string|undefined,
 *   keySet: Record<string, boolean>,
 *   options: typeof PROVIDER_OPTIONS,
 *   isConfigured: (id: string) => boolean,
 *   loading: boolean,
 *   saving: boolean,
 *   error: string|null,
 *   setProvider: (id: string) => Promise<void>,
 *   refresh: () => Promise<void>,
 * }}
 */
export default function useLangchainProvider() {
  const [provider, setProviderState] = useState("helix");
  const [model, setModel] = useState(undefined);
  const [keySet, setKeySet] = useState({ ollama: true });
  const [defaultModels, setDefaultModels] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setModeState] = useState("heuristics_helix");
  const [externalWiring, setExternalWiringState] = useState("bff");
  const [modeOptions, setModeOptions] = useState([]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(STATUS_URL, { credentials: "include" });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = await res.json();
      setProviderState(d.provider || "helix");
      setModel(d.model);
      setKeySet(d.key_set || { ollama: true });
      setDefaultModels(d.default_models || {});
      setModeState(d.agent_mode || "heuristics_helix");
      setExternalWiringState(d.external_wiring || "bff");
      setModeOptions(d.agent_modes || []);
    } catch (e) {
      setError(e.message || "Failed to load provider");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isConfigured = useCallback((id) => keySet[id] === true, [keySet]);

  const setProvider = useCallback(
    async (id) => {
      if (id === provider) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(SAVE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ provider: id, model: defaultModels[id] }),
        });
        if (!res.ok) throw new Error(`save ${res.status}`);
        const d = await res.json();
        // Server returns the *resolved* provider (e.g. ollama→helix when
        // unconfigured); trust it so the UI reflects reality.
        setProviderState(d.provider || id);
        setModel(d.model);
      } catch (e) {
        setError(e.message || "Failed to save provider");
      } finally {
        setSaving(false);
      }
    },
    [provider, defaultModels],
  );

  const setMode = useCallback(async (id, wiring) => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agent_mode: id, external_wiring: wiring }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      const d = await res.json();
      setModeState(d.agent_mode || id);
      setExternalWiringState(d.external_wiring || "bff");
    } catch (e) {
      setError(e.message || "Failed to save mode");
    } finally { setSaving(false); }
  }, []);

  const setExternalWiring = useCallback(
    (w) => setMode(mode, w), [setMode, mode]);

  return {
    provider,
    model,
    keySet,
    options: PROVIDER_OPTIONS,
    isConfigured,
    loading,
    saving,
    error,
    setProvider,
    refresh,
    mode,
    externalWiring,
    modeOptions,
    setMode,
    setExternalWiring,
  };
}
