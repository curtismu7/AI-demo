// demo_api_ui/src/hooks/useActivityLog.js
/**
 * Manages live app-event state for the Activity Log tab.
 *
 * - Wraps useAppEventsSSE (handles EventSource lifecycle).
 * - Maintains a 200-event ring buffer (newest first).
 * - Per-category filter: 15 known categories, all active by default.
 * - Pause: stops prepending to visible list but keeps SSE open.
 * - Clear: empties visible list; new events continue.
 * - newCount: events received while isPaused or tab is not focused (for badge).
 *
 * @param {{ enabled: boolean }} opts
 *   enabled — connect SSE only when the modal is open AND this tab is active.
 */
import { useState, useCallback, useRef } from 'react';
import { useAppEventsSSE } from './useAppEventsSSE';

export const ALL_CATEGORIES = [
  'oauth',
  'token_exchange',
  'mcp',
  'delegation',
  'hitl',
  'authorize',
  'gateway_path',
  'threshold',
  'introspection',
  'helix',
  'agent',
  'agent_prompt',
  'session',
  'jwks',
  'auth_lifecycle',
];

const MAX_EVENTS = 200;

export function useActivityLog({ enabled = false } = {}) {
  const [events, setEvents] = useState([]);
  const [isPaused, setIsPaused] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [activeFilters, setActiveFiltersState] = useState(
    () => new Set(ALL_CATEGORIES),
  );

  // Keep a ref to avoid stale closures inside the SSE callback.
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  const handleEvent = useCallback((event) => {
    if (isPausedRef.current) {
      setNewCount((n) => n + 1);
      return;
    }
    setEvents((prev) => {
      const next = [event, ...prev];
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next;
    });
    setNewCount((n) => n + 1);
  }, []);

  useAppEventsSSE(handleEvent, { enabled });

  const pause = useCallback(() => setIsPaused(true), []);

  const resume = useCallback(() => {
    setIsPaused(false);
    setNewCount(0);
  }, []);

  const clear = useCallback(() => {
    setEvents([]);
    setNewCount(0);
  }, []);

  const resetNewCount = useCallback(() => setNewCount(0), []);

  const toggleFilter = useCallback((category) => {
    setActiveFiltersState((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const setAllFilters = useCallback((enabled) => {
    setActiveFiltersState(enabled ? new Set(ALL_CATEGORIES) : new Set());
  }, []);

  // Apply category filter for display.
  const filteredEvents = events.filter((e) => activeFilters.has(e.category));

  return {
    events: filteredEvents,
    isPaused,
    newCount,
    activeFilters,
    toggleFilter,
    setAllFilters,
    pause,
    resume,
    clear,
    resetNewCount,
  };
}
