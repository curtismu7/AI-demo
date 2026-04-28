/**
 * ArchitectureTokenFlowPage.js — /architecture/token-flow
 *
 * Simulate Flow walks through TOKEN_FLOW_SIMULATE_STEPS:
 *   - Current step: bright active color + explanation label in box
 *   - Previous steps: muted grey (active-prev) + label stays visible
 *   - All cleared when simulation ends
 *
 * Live events (admin): regions activate for 4s; historical on mount for 15s.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { TOKEN_FLOW_REGIONS } from '../config/diagram-token-flow-regions';

const TOKEN_FLOW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke'], regionIds: ['agent1', 'llm'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent1'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/heuristic_tool'], regionIds: ['agent1'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize-tf'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize-tf'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize-tf'], colorClass: 'active-error' },
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'mcp', tags: [], regionIds: ['mcp-gateway-tf'], colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], regionIds: ['chatbot'], colorClass: 'active' },
];

// Each step: which regions light up, what color, and what label to show inside the box.
const TOKEN_FLOW_SIMULATE_STEPS = [
  { regionIds: ['olb-application'],                       colorClass: 'active',        label: 'User sends request' },
  { regionIds: ['olb-application', 'chatbot'],            colorClass: 'active',        label: 'Chatbot receives message' },
  { regionIds: ['chatbot', 'agent1'],                     colorClass: 'active',        label: 'Agent takes over' },
  { regionIds: ['agent1', 'llm'],                         colorClass: 'active',        label: 'LLM processes intent' },
  { regionIds: ['agent1', 'pingone-aic'],                 colorClass: 'active',        label: 'Request delegation token' },
  { regionIds: ['pingone-aic', 'token-exchange-box'],     colorClass: 'active',        label: 'RFC 8693 token exchange' },
  { regionIds: ['token-exchange-box', 'mcp-gateway-tf'],  colorClass: 'active',        label: 'Delegated token to MCP GW' },
  { regionIds: ['mcp-gateway-tf', 'pingauthorize-tf'],    colorClass: 'active',        label: 'Fine-grained policy check' },
  { regionIds: ['pingauthorize-tf'],                      colorClass: 'active-permit', label: 'PERMIT — access granted' },
  { regionIds: ['mcp-gateway-tf', 'mcp-olb'],             colorClass: 'active',        label: 'MCP OLB tool call' },
  { regionIds: ['mcp-olb', 'oauth-rs'],                   colorClass: 'active',        label: 'Balance API called' },
  { regionIds: ['mcp-invest', 'oauth-rs'],                colorClass: 'active',        label: 'Investments API called' },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 1800;

function mapEventToRegions(event) {
  for (const rule of TOKEN_FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((regionId) => ({ regionId, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];
  const lower = responseText.toLowerCase();
  return TOKEN_FLOW_REGIONS.filter(
    (r) => r.keywords?.some((kw) => lower.includes(kw))
  ).map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureTokenFlowPage({ user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const [regionLabels, setRegionLabels] = useState({});
  const [isSimulating, setIsSimulating] = useState(false);
  const clearTimers = useRef({});
  const simTimeouts = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active', timeoutMs = HIGHLIGHT_TIMEOUT_MS) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => { const n = { ...prev }; delete n[regionId]; return n; });
      delete clearTimers.current[regionId];
    }, timeoutMs);
  }, []);

  const processEvents = useCallback((events, historical = false) => {
    const timeout = historical ? HISTORICAL_TIMEOUT_MS : HIGHLIGHT_TIMEOUT_MS;
    events.forEach((evt) => {
      mapEventToRegions(evt).forEach(({ regionId, colorClass }) =>
        activateRegion(regionId, colorClass, timeout)
      );
      if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response) {
        scanKeywords(evt.metadata.response).forEach(({ regionId, colorClass }) =>
          activateRegion(regionId, colorClass, timeout)
        );
      }
    });
  }, [activateRegion]);

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isHistorical = !lastFetchedAt.current;
      const res = await apiClient.get(`/api/admin/app-events?limit=50&since=${since}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, isHistorical);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  // Simulate: at each step set current regions as active + all prior as active-prev.
  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    TOKEN_FLOW_SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        const regions = {};
        const labels = {};

        // All previous steps → muted grey with label
        for (let j = 0; j < i; j++) {
          TOKEN_FLOW_SIMULATE_STEPS[j].regionIds.forEach((id) => {
            regions[id] = 'active-prev';
            labels[id] = TOKEN_FLOW_SIMULATE_STEPS[j].label;
          });
        }
        // Current step → active color with label
        step.regionIds.forEach((id) => {
          regions[id] = step.colorClass;
          labels[id] = step.label;
        });

        setActiveRegions(regions);
        setRegionLabels(labels);

        if (i === TOKEN_FLOW_SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => {
            setActiveRegions({});
            setRegionLabels({});
            setIsSimulating(false);
          }, HIGHLIGHT_TIMEOUT_MS);
          simTimeouts.current.push(done);
        }
      }, i * STEP_INTERVAL_MS);
      simTimeouts.current.push(t);
    });
  }, [isSimulating]);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(pollRef.current);
      Object.values(clearTimers.current).forEach(clearTimeout);
      simTimeouts.current.forEach(clearTimeout);
      clearTimers.current = {};
    };
  }, [fetchEvents]);

  return (
    <ArchitectureDiagramPage
      title="Token Flow Diagram"
      imageSrc="/architecture/token-flow.png"
      imageAlt="Token flow: OLB App, agent1, LLM, PingOne AIC, Token Exchange, PingAuthorize, MCP Gateway, MCP OLB, MCP Invest, OAuth RS"
      regions={TOKEN_FLOW_REGIONS}
      activeRegions={activeRegions}
      regionLabels={regionLabels}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
    />
  );
}
