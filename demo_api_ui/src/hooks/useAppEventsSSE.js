// banking_api_ui/src/hooks/useAppEventsSSE.js
/**
 * Subscribe to live app events via SSE (/api/app-events/stream).
 * Calls onEvent(event) for each new event pushed by the server.
 * Falls back to silent no-op if EventSource is unavailable.
 *
 * @param {(event: object) => void} onEvent
 * @param {{ category?: string, severity?: string, enabled?: boolean }} [opts]
 */
import { useEffect, useRef } from 'react';

export function useAppEventsSSE(onEvent, opts = {}) {
  const { category, severity, enabled = true } = opts;
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;

    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (severity) params.set('severity', severity);
    const url = `/api/app-events/stream${params.toString() ? `?${params}` : ''}`;

    let es;
    try {
      es = new EventSource(url);
    } catch (_) {
      return;
    }

    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        onEventRef.current(data);
      } catch (_) {}
    };

    es.onerror = () => {
      // Browser auto-reconnects; nothing to do here
    };

    return () => {
      try { es.close(); } catch (_) {}
    };
  }, [enabled, category, severity]); // eslint-disable-line react-hooks/exhaustive-deps
}
