/**
 * ArchitectureTokenFlowPage.js
 *
 * Architecture diagram page for /architecture/token-flow.
 * Shows the detailed whiteboard token-flow diagram with live region highlighting.
 *
 * Event wiring mirrors ArchitectureOverviewPage but maps to more granular
 * token-flow diagram components: OLB Application, chatbot, agent1, LLM,
 * PingOne AIC, Token Exchange box, PingAuthorize, MCP Gateway, MCP OLB,
 * MCP Invest, OAuth RS.
 *
 * On mount, fetches the last 5 minutes of events so state from other pages
 * is visible immediately. Historical events stay highlighted for 15s;
 * live events for 4s.
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

// Ordered steps for the Simulate Flow button — walks through each hop in the token flow.
const TOKEN_FLOW_SIMULATE_STEPS = [
  { regionIds: ['olb-application'],                          colorClass: 'active' },
  { regionIds: ['olb-application', 'chatbot'],               colorClass: 'active' },
  { regionIds: ['chatbot', 'agent1'],                        colorClass: 'active' },
  { regionIds: ['agent1', 'llm'],                            colorClass: 'active' },
  { regionIds: ['agent1', 'pingone-aic'],                    colorClass: 'active' },
  { regionIds: ['pingone-aic', 'token-exchange-box'],        colorClass: 'active' },
  { regionIds: ['token-exchange-box', 'mcp-gateway-tf'],     colorClass: 'active' },
  { regionIds: ['mcp-gateway-tf', 'pingauthorize-tf'],       colorClass: 'active' },
  { regionIds: ['pingauthorize-tf'],                         colorClass: 'active-permit' },
  { regionIds: ['mcp-gateway-tf', 'mcp-olb'],               colorClass: 'active' },
  { regionIds: ['mcp-olb', 'oauth-rs'],                      colorClass: 'active' },
  { regionIds: ['mcp-invest', 'oauth-rs'],                   colorClass: 'active' },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 1500;

function mapEventToRegions(event) {
  const hits = [];
  for (const rule of TOKEN_FLOW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    for (const regionId of rule.regionIds) {
      hits.push({ regionId, colorClass: rule.colorClass });
    }
    break;
  }
  return hits;
}

function scanKeywords(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];
  const lower = responseText.toLowerCase();
  const hits = [];
  for (const region of TOKEN_FLOW_REGIONS) {
    if (!region.keywords || region.keywords.length === 0) continue;
    if (region.keywords.some((kw) => lower.includes(kw))) {
      hits.push({ regionId: region.id, colorClass: 'active' });
    }
  }
  return hits;
}

export default function ArchitectureTokenFlowPage({ user }) {
  const [activeRegions, setActiveRegions] = useState({});
  const [isSimulating, setIsSimulating] = useState(false);
  const clearTimers = useRef({});
  const simTimeouts = useRef([]);
  const lastFetchedAt = useRef(null);
  const pollRef = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active', timeoutMs = HIGHLIGHT_TIMEOUT_MS) => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => {
        const next = { ...prev };
        delete next[regionId];
        return next;
      });
      delete clearTimers.current[regionId];
    }, timeoutMs);
  }, []);

  const processEvents = useCallback(
    (events, historical = false) => {
      const timeout = historical ? HISTORICAL_TIMEOUT_MS : HIGHLIGHT_TIMEOUT_MS;
      events.forEach((evt) => {
        const staticHits = mapEventToRegions(evt);
        staticHits.forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, timeout));

        if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response) {
          const kwHits = scanKeywords(evt.metadata.response);
          kwHits.forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass, timeout));
        }
      });
    },
    [activateRegion]
  );

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({ limit: '50' });
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isHistorical = !lastFetchedAt.current;
      params.append('since', since);
      const res = await apiClient.get(`/api/admin/app-events?${params.toString()}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, isHistorical);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    TOKEN_FLOW_SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        step.regionIds.forEach((id) => activateRegion(id, step.colorClass));
        if (i === TOKEN_FLOW_SIMULATE_STEPS.length - 1) {
          const done = setTimeout(() => setIsSimulating(false), HIGHLIGHT_TIMEOUT_MS);
          simTimeouts.current.push(done);
        }
      }, i * STEP_INTERVAL_MS);
      simTimeouts.current.push(t);
    });
  }, [isSimulating, activateRegion]);

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
      imageAlt="Detailed token-flow diagram: OLB Application, agent1, LLM, PingOne AIC, Token Exchange, PingAuthorize, MCP Gateway, MCP OLB, MCP Invest, OAuth RS"
      regions={TOKEN_FLOW_REGIONS}
      activeRegions={activeRegions}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
    />
  );
}
