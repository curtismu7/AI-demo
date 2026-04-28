/**
 * ArchitectureOverviewPage.js — /architecture/overview
 *
 * Simulate Flow walks through OVERVIEW_SIMULATE_STEPS:
 *   - Current step: bright active color + explanation label in box
 *   - Previous steps: muted grey (active-prev) + label stays visible
 *   - All cleared when simulation ends
 *
 * Live events (admin): regions activate for 4s; historical on mount for 15s.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { OVERVIEW_REGIONS } from '../config/diagram-overview-regions';

const OVERVIEW_EVENT_MAP = [
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], regionIds: ['agent'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active-error' },
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize'], colorClass: 'active-error' },
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'mcp', tags: [], regionIds: ['mcp-gw'], colorClass: 'active' },
  { category: 'agent', tags: ['agent/message'], regionIds: ['agent'], colorClass: 'active' },
];

// Each step: which regions light up, what color, and what label to show inside the box.
const OVERVIEW_SIMULATE_STEPS = [
  { regionIds: ['user'],                    colorClass: 'active',        label: 'User starts request' },
  { regionIds: ['user', 'idp-oauth-as'],   colorClass: 'active',        label: 'OAuth 2.0 PKCE login' },
  { regionIds: ['idp-oauth-as', 'agent'],  colorClass: 'active',        label: 'Token issued to agent' },
  { regionIds: ['agent'],                   colorClass: 'active',        label: 'Agent analyzes request' },
  { regionIds: ['agent', 'mcp-gw'],        colorClass: 'active',        label: 'Agent calls MCP tools' },
  { regionIds: ['mcp-gw', 'pingauthorize'],colorClass: 'active',        label: 'Policy check' },
  { regionIds: ['pingauthorize'],           colorClass: 'active-permit', label: 'PERMIT — access granted' },
  { regionIds: ['api-gw', 'service-a'],    colorClass: 'active',        label: 'API call to backend' },
  { regionIds: ['service-b', 'service-c'], colorClass: 'active',        label: 'Services respond' },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 1800;

function mapEventToRegions(event) {
  for (const rule of OVERVIEW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    return rule.regionIds.map((regionId) => ({ regionId, colorClass: rule.colorClass }));
  }
  return [];
}

function scanKeywords(responseText) {
  if (!responseText || typeof responseText !== 'string') return [];
  const lower = responseText.toLowerCase();
  return OVERVIEW_REGIONS.filter(
    (r) => r.keywords?.some((kw) => lower.includes(kw))
  ).map((r) => ({ regionId: r.id, colorClass: 'active' }));
}

export default function ArchitectureOverviewPage({ user }) {
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
  // Regions carry their explanation label; previous steps' labels persist on screen.
  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    OVERVIEW_SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        const regions = {};
        const labels = {};

        // All previous steps → muted grey
        for (let j = 0; j < i; j++) {
          OVERVIEW_SIMULATE_STEPS[j].regionIds.forEach((id) => {
            regions[id] = 'active-prev';
            labels[id] = OVERVIEW_SIMULATE_STEPS[j].label;
          });
        }
        // Current step → active color
        step.regionIds.forEach((id) => {
          regions[id] = step.colorClass;
          labels[id] = step.label;
        });

        setActiveRegions(regions);
        setRegionLabels(labels);

        if (i === OVERVIEW_SIMULATE_STEPS.length - 1) {
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
      title="Architecture Overview"
      imageSrc="/architecture/overview.png"
      imageAlt="Ping Identity Digital Assistants: User, Trust Boundary, IdP, Agent, MCP Gateway, PingAuthorize, Backend Services"
      regions={OVERVIEW_REGIONS}
      activeRegions={activeRegions}
      regionLabels={regionLabels}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
    />
  );
}
