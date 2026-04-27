/**
 * ArchitectureOverviewPage.js
 *
 * Architecture diagram page for /architecture/overview.
 * Shows the Ping Identity Digital Assistants overview diagram with live region highlighting.
 *
 * Event wiring:
 * - Polls /api/admin/app-events every 10s (admin users only)
 * - Uses ?since= to only fetch new events (avoids reprocessing stale events)
 * - Maps event category + tag to region IDs via OVERVIEW_EVENT_MAP
 * - Scans agent_prompt/llm_complete metadata.response for component keywords
 * - Per-region timers (useRef) so each region clears independently after 4000ms
 *
 * Non-admin users: polling is skipped; ArchitectureDiagramPage shows static diagram + notice.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/apiClient';
import ArchitectureDiagramPage from './ArchitectureDiagramPage';
import { OVERVIEW_REGIONS } from '../config/diagram-overview-regions';

// Static event → region ID mapping for overview diagram.
// colorClass: 'active' | 'active-error' | 'active-permit'
// regionIds: array of region ids from OVERVIEW_REGIONS to activate
const OVERVIEW_EVENT_MAP = [
  // Agent events
  { category: 'agent_prompt', tags: ['agent_prompt/llm_invoke', 'agent_prompt/heuristic_tool'], regionIds: ['agent'], colorClass: 'active' },
  { category: 'agent_prompt', tags: ['agent_prompt/llm_complete'], regionIds: ['agent'], colorClass: 'active' },
  // Token exchange
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-success'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active' },
  { category: 'token_exchange', tags: ['token_exchange/rfc8693-error'], regionIds: ['idp-oauth-as', 'mcp-gw'], colorClass: 'active-error' },
  // PingAuthorize decisions
  { category: 'authorize', tags: ['authorize/bypass'], regionIds: ['pingauthorize'], colorClass: 'active' },
  { category: 'authorize', tags: ['authorize/permit'], regionIds: ['pingauthorize'], colorClass: 'active-permit' },
  { category: 'authorize', tags: ['authorize/deny'], regionIds: ['pingauthorize'], colorClass: 'active-error' },
  // OAuth / user auth
  { category: 'oauth', tags: ['oauth/user/callback'], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  { category: 'oauth', tags: [], regionIds: ['user', 'idp-oauth-as'], colorClass: 'active' },
  // MCP events
  { category: 'mcp', tags: [], regionIds: ['mcp-gw'], colorClass: 'active' },
  // Agent message
  { category: 'agent', tags: ['agent/message'], regionIds: ['agent'], colorClass: 'active' },
];

const HIGHLIGHT_TIMEOUT_MS = 4000;

function mapEventToRegions(event) {
  const hits = [];
  for (const rule of OVERVIEW_EVENT_MAP) {
    if (event.category !== rule.category) continue;
    if (rule.tags.length > 0 && !rule.tags.includes(event.tag)) continue;
    for (const regionId of rule.regionIds) {
      hits.push({ regionId, colorClass: rule.colorClass });
    }
    break; // first matching rule wins
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
    if (user?.role !== 'admin') return;
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (lastFetchedAt.current) params.append('since', lastFetchedAt.current);
      const res = await apiClient.get(`/api/admin/app-events?${params.toString()}`);
      const events = res.data?.events || [];
      if (events.length > 0) processEvents(events);
      lastFetchedAt.current = new Date().toISOString();
    } catch (_err) {
      // Swallow 403 silently — non-admin path or session expired
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
      title="Architecture Overview"
      imageSrc="/architecture/overview.png"
      imageAlt="Ping Identity Digital Assistants architecture: User, Trust Boundary, IdP, Agent, MCP Gateway, PingAuthorize, Backend Services"
      regions={OVERVIEW_REGIONS}
      activeRegions={activeRegions}
      user={user}
    />
  );
}
