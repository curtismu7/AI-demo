// banking_api_ui/src/services/spinnerActivityService.js
/**
 * Spinner activity feed service — polls /api/admin/app-events while the spinner
 * is visible, collecting server-side events (OAuth, token exchange, MCP, JWKS, etc.)
 * into a compact feed displayed inside the spinner overlay.
 *
 * Also accepts client-side events (API calls in-flight) so they appear instantly.
 *
 * Uses a private axios instance WITHOUT interceptors to avoid triggering the spinner
 * recursively (which would cause an infinite loop).
 */
import axios from 'axios';
import { resolveApiBaseUrl } from '../utils/resolveApiBaseUrl';

const POLL_INTERVAL_MS = 2000;
const MAX_EVENTS = 20;

/** Category → emoji icon mapping */
const CATEGORY_ICONS = {
  oauth:          '🔑',
  token_exchange: '🔄',
  session:        '💾',
  jwks:           '🛡️',
  mcp:            '🤖',
  auth_lifecycle: '🔐',
  client:         '📡',
  authorization:  '⚖️',
  config:         '⚙️',
};

/** Private axios instance — no spinner interceptors */
const _http = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 5000,
  withCredentials: true,
});

let _events = [];
let _pollTimer = null;
let _startedAt = null;
let _sinceTimestamp = null;
let _stopped = false;
const _listeners = new Set();

function notify() {
  const snapshot = [..._events];
  _listeners.forEach(fn => { try { fn(snapshot); } catch (_) {} });
}

function timeDelta(eventTimestamp) {
  if (!_startedAt) return '+0.0s';
  const delta = (new Date(eventTimestamp).getTime() - _startedAt) / 1000;
  return `+${Math.max(0, delta).toFixed(1)}s`;
}

function iconFor(category) {
  return CATEGORY_ICONS[category] || '📋';
}

function truncate(str, max = 80) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function pushEvent(evt) {
  _events.push(evt);
  if (_events.length > MAX_EVENTS) _events = _events.slice(-MAX_EVENTS);
  notify();
}

async function poll() {
  if (_stopped) return;
  try {
    const params = { limit: 20 };
    if (_sinceTimestamp) params.since = _sinceTimestamp;
    const res = await _http.get('/api/admin/app-events', { params });
    const serverEvents = res.data?.events || [];

    for (const e of serverEvents) {
      // Dedup by id
      if (_events.some(x => x.id === e.id)) continue;
      pushEvent({
        id: e.id,
        icon: iconFor(e.category),
        timeDelta: timeDelta(e.timestamp),
        message: truncate(e.message),
        source: 'server',
      });
    }

    // Advance since cursor to latest event
    if (serverEvents.length > 0) {
      _sinceTimestamp = serverEvents[serverEvents.length - 1].timestamp;
    }
  } catch (err) {
    const status = err?.response?.status;
    // Non-admin or unauthenticated — silently stop, no retries
    if (status === 401 || status === 403) {
      spinnerActivity.stop();
      return;
    }
    // Other errors: ignore silently (network blip, server down)
  }
}

let _clientEventId = 0;

export const spinnerActivity = {
  /**
   * Start polling. Called when spinner becomes visible.
   */
  start() {
    if (_pollTimer) return; // already running
    _stopped = false;
    _startedAt = Date.now();
    _sinceTimestamp = new Date(_startedAt).toISOString();
    _events = [];
    _clientEventId = 0;
    notify();

    // First poll immediately, then on interval
    poll();
    _pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  },

  /**
   * Stop polling. Called when spinner hides.
   */
  stop() {
    _stopped = true;
    if (_pollTimer) {
      clearInterval(_pollTimer);
      _pollTimer = null;
    }
  },

  /**
   * Add a client-side event (e.g. in-flight API call) instantly.
   * @param {string} method - HTTP method
   * @param {string} url - Request URL
   */
  addClientEvent(method, url) {
    if (_stopped || !_startedAt) return;
    _clientEventId++;
    pushEvent({
      id: `client-${_clientEventId}`,
      icon: iconFor('client'),
      timeDelta: timeDelta(new Date().toISOString()),
      message: truncate(`${method} ${url}`),
      source: 'client',
    });
  },

  /**
   * Subscribe to event changes. Returns unsubscribe function.
   * @param {function} fn - Callback receiving event array
   */
  subscribe(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  getEvents() {
    return [..._events];
  },
};
