/**
 * ArchitectureOverviewPage.js
 *
 * Architecture diagram page for /architecture/overview.
 * Shows the Ping Identity Digital Assistants overview diagram with live region highlighting.
 *
 * Event wiring:
 * - On mount, fetches the last 5 minutes of events so historical activity is visible
 *   immediately (even after navigating away and back).
 * - Polls /api/admin/app-events every 10s for new events; uses ?since= to avoid reprocessing.
 * - Maps event category + tag to region IDs via OVERVIEW_EVENT_MAP.
 * - Scans agent_prompt/llm_complete metadata.response for component keywords.
 * - Per-region timers (useRef) so each region clears independently.
 *   Historical events (first load) stay highlighted for 15s; live events for 4s.
 *
 * Simulate Flow:
 * - Steps through OVERVIEW_SIMULATE_STEPS in order (1.5s between each step).
 * - Activates region highlights exactly as live events do, so the diagram
 *   shows the full user→agent→MCP→PingAuthorize→service flow.
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

// Ordered steps for the Simulate Flow button.
// Each step activates one or more regions with a 1.5s gap between steps.
const OVERVIEW_SIMULATE_STEPS = [
  { regionIds: ['user'],                        colorClass: 'active' },
  { regionIds: ['user', 'idp-oauth-as'],        colorClass: 'active' },
  { regionIds: ['idp-oauth-as', 'agent'],       colorClass: 'active' },
  { regionIds: ['agent'],                       colorClass: 'active' },
  { regionIds: ['agent', 'mcp-gw'],             colorClass: 'active' },
  { regionIds: ['mcp-gw', 'pingauthorize'],     colorClass: 'active' },
  { regionIds: ['pingauthorize'],               colorClass: 'active-permit' },
  { regionIds: ['api-gw', 'service-a'],         colorClass: 'active' },
  { regionIds: ['service-b', 'service-c'],      colorClass: 'active' },
];

const HIGHLIGHT_TIMEOUT_MS  = 4000;
const HISTORICAL_TIMEOUT_MS = 15000;
const STEP_INTERVAL_MS      = 1500;

function mapEventToRegions(event) {
  const hits = [];
  for (const rule of OVERVIEW_EVENT_MAP) {
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
  for (const region of OVERVIEW_REGIONS) {
    if (!region.keywords || region.keywords.length === 0) continue;
    if (region.keywords.some((kw) => lower.includes(kw))) {
      hits.push({ regionId: region.id, colorClass: 'active' });
    }
  }
  return hits;
}

export default function ArchitectureOverviewPage({ user }) {
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
      // First fetch looks back 5 minutes so events from other pages are visible immediately.
      const since = lastFetchedAt.current || new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const isHistorical = !lastFetchedAt.current;
      params.append('since', since);
      const res = await apiClient.get(`/api/admin/app-events?${params.toString()}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events, isHistorical);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      // Swallow 403 silently for non-admin users
      if (!lastFetchedAt.current) lastFetchedAt.current = new Date().toISOString();
    }
  }, [user, processEvents]);

  const runSimulation = useCallback(() => {
    if (isSimulating) return;
    setIsSimulating(true);
    simTimeouts.current.forEach(clearTimeout);
    simTimeouts.current = [];

    OVERVIEW_SIMULATE_STEPS.forEach((step, i) => {
      const t = setTimeout(() => {
        step.regionIds.forEach((id) => activateRegion(id, step.colorClass));
        if (i === OVERVIEW_SIMULATE_STEPS.length - 1) {
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
      title="Architecture Overview"
      imageSrc="/architecture/overview.png"
      imageAlt="Ping Identity Digital Assistants architecture: User, Trust Boundary, IdP, Agent, MCP Gateway, PingAuthorize, Backend Services"
      regions={OVERVIEW_REGIONS}
      activeRegions={activeRegions}
      user={user}
      onSimulate={runSimulation}
      isSimulating={isSimulating}
    />
  );
}
