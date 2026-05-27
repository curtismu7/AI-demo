// demo_api_ui/src/components/ActivityLogPanel.js
/**
 * Activity Log tab content — live event stream from /api/app-events/stream.
 *
 * Toolbar:  Live/Reconnecting status · Pause · Resume · Clear
 * Filters:  Category pills (15 categories, all-on by default)
 * List:     Newest-first rows; click to expand metadata JSON
 */
import React, { useState, useEffect, useRef } from 'react';
import { useActivityLog, ALL_CATEGORIES } from '../hooks/useActivityLog';
import './ActivityLogPanel.css';

function severityIcon(severity) {
  if (severity === 'error') return '❌';
  if (severity === 'warning' || severity === 'warn') return '⚠️';
  return '✅';
}

const EventRow = React.memo(function EventRow({ event }) {
  const [expanded, setExpanded] = useState(false);

  const ts = new Date(event.timestamp);
  const timeStr = isNaN(ts.getTime())
    ? '--:--:--'
    : ts.toTimeString().slice(0, 8); // HH:mm:ss

  const detail =
    event.metadata != null
      ? JSON.stringify(event.metadata, null, 2)
      : event.tag
      ? JSON.stringify({ tag: event.tag }, null, 2)
      : null;

  return (
    <div
      className={`alp-row${detail ? ' alp-row--expandable' : ''}${expanded ? ' alp-row--expanded' : ''}`}
      onClick={() => detail && setExpanded((v) => !v)}
    >
      <div className="alp-row-main">
        <span className="alp-row-time">{timeStr}</span>
        <span className="alp-row-cat">
          <span className={`alp-pill alp-cat--${event.category || 'unknown'}`}>
            {event.category || 'unknown'}
          </span>
        </span>
        <span className="alp-row-sev">{severityIcon(event.severity)}</span>
        <span className="alp-row-msg" title={event.message}>
          {event.message}
        </span>
        {detail && (
          <span className="alp-row-expand-icon">▶</span>
        )}
      </div>
      {expanded && detail && (
        <div className="alp-row-detail">
          <pre>{detail}</pre>
        </div>
      )}
    </div>
  );
});

export default function ActivityLogPanel({ enabled }) {
  const {
    events,
    isPaused,
    newCount,
    activeFilters,
    toggleFilter,
    setAllFilters,
    pause,
    resume,
    clear,
    resetNewCount,
  } = useActivityLog({ enabled });

  // Reset pause count whenever this panel becomes active.
  useEffect(() => {
    if (enabled) resetNewCount();
  }, [enabled, resetNewCount]);

  // Track connection health: starts false, goes live on first event, drops
  // to reconnecting if no events for >35s.
  const [isLive, setIsLive] = useState(false);
  const lastEventTime = useRef(null);

  useEffect(() => {
    if (events.length > 0) {
      lastEventTime.current = Date.now();
      setIsLive(true);
    }
  }, [events]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (lastEventTime.current !== null) {
        setIsLive(Date.now() - lastEventTime.current < 35000);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [enabled]);

  const allOn = activeFilters.size === ALL_CATEGORIES.length;

  return (
    <div className="alp-root">
      {/* Toolbar */}
      <div className="alp-toolbar">
        <span className={`alp-status ${isLive ? 'alp-status--live' : 'alp-status--reconnecting'}`}>
          <span className="alp-status-dot" />
          {isLive ? 'Live' : 'Connecting…'}
        </span>

        {isPaused ? (
          <button type="button" className="alp-btn" onClick={resume}>
            Resume{newCount > 0 ? ` (+${newCount})` : ''}
          </button>
        ) : (
          <button type="button" className="alp-btn" onClick={pause}>
            Pause
          </button>
        )}

        <button type="button" className="alp-btn" onClick={clear}>
          Clear
        </button>
      </div>

      {/* Category filter pills */}
      <div className="alp-filters">
        <button
          type="button"
          className="alp-filter-all"
          onClick={() => setAllFilters(!allOn)}
        >
          {allOn ? 'Deselect all' : 'Select all'}
        </button>
        {ALL_CATEGORIES.map((cat) => (
          <button
            type="button"
            key={cat}
            className={`alp-pill alp-cat--${cat}${activeFilters.has(cat) ? '' : ' alp-pill--off'}`}
            onClick={() => toggleFilter(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Event list */}
      <div className="alp-list">
        {events.length === 0 ? (
          <div className="alp-empty">
            {isPaused
              ? 'Paused — resume to see new events'
              : 'Waiting for events…'}
          </div>
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id || `${event.timestamp}-${event.category}-${event.message}`}
              event={event}
            />
          ))
        )}
      </div>
    </div>
  );
}
