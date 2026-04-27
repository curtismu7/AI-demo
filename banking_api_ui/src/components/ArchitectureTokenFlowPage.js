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
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { TOKEN_FLOW_REGIONS } from '../config/diagram-token-flow-regions';

// Static event → region ID mapping for token-flow diagram.
const TOKEN_FLOW_EVENT_MAP = [
  // Agent events — highlight agent1 and LLM
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke'], regionIds: ['agent1', 'llm'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent1'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/heuristic_tool'], regionIds: ['agent1'], colorClass: 'active' },
  // Token exchange — highlight PingOne AIC, Token Exchange box, MCP Gateway
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['pingone-aic', 'token-exchange-box', 'mcp-gateway-tf'], colorClass: 'active-error' },
  // PingAuthorize decisions
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize-tf'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize-tf'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize-tf'], colorClass: 'active-error' },
  // OAuth / user auth — highlight OLB Application and PingOne AIC
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['olb-application', 'pingone-aic'], colorClass: 'active' },
  // MCP events
  { category: 'mcp', tags: [], regionIds: ['mcp-gateway-tf'], colorClass: 'active' },
  // Agent message to chatbot
  { category: 'agent', tags: ['agent/message'], regionIds: ['chatbot'], colorClass: 'active' },
];

const HIGHLIGHT_TIMEOUT_MS = 4000;

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
  const clearTimers = useRef({});
  const lastFetchedAt = useRef(null);
  const pollRef = useRef(null);

  const activateRegion = useCallback((regionId, colorClass = 'active') => {
    if (clearTimers.current[regionId]) clearTimeout(clearTimers.current[regionId]);
    setActiveRegions((prev) => ({ ...prev, [regionId]: colorClass }));
    clearTimers.current[regionId] = setTimeout(() => {
      setActiveRegions((prev) => {
        const next = { ...prev };
        delete next[regionId];
        return next;
      });
      delete clearTimers.current[regionId];
    }, HIGHLIGHT_TIMEOUT_MS);
  }, []);

  const processEvents = useCallback(
    (events) => {
      events.forEach((evt) => {
        const staticHits = mapEventToRegions(evt);
        staticHits.forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass));

        if (evt.tag === 'agent_prompt/llm_complete' && evt.metadata?.response) {
          const kwHits = scanKeywords(evt.metadata.response);
          kwHits.forEach(({ regionId, colorClass }) => activateRegion(regionId, colorClass));
        }
      });
    },
    [activateRegion]
  );

  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (lastFetchedAt.current) params.append('since', lastFetchedAt.current);
      const res = await apiClient.get(`/api/admin/app-events?${params.toString()}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      // Swallow 403 silently
    }
  }, [user, processEvents]);

  useEffect(() => {
    fetchEvents();
    pollRef.current = setInterval(fetchEvents, 10000);
    return () => {
      clearInterval(pollRef.current);
      Object.values(clearTimers.current).forEach(clearTimeout);
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
    />
  );
}
