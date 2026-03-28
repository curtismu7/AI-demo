// banking_api_ui/src/components/EmbeddedAgentDock.js
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import BankingAgent from './BankingAgent';
import { isEmbeddedAgentDockRoute, isBankingAgentDashboardRoute } from '../utils/embeddedAgentFabVisibility';

const HEIGHT_KEY = 'embedded_agent_dock_height_px';
const COLLAPSE_KEY = 'embedded_agent_dock_collapsed';
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 200;
const MAX_HEIGHT_RATIO = 0.85;

function readStoredHeight() {
  try {
    const n = parseInt(localStorage.getItem(HEIGHT_KEY) || '', 10);
    if (Number.isFinite(n) && n >= MIN_HEIGHT) return Math.min(n, Math.round(window.innerHeight * MAX_HEIGHT_RATIO));
  } catch {
    /* ignore */
  }
  return DEFAULT_HEIGHT;
}

function readStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Bottom embedded AI agent: content-width strip, collapsible, vertically resizable.
 */
export default function EmbeddedAgentDock({ user, onLogout, agentPlacement }) {
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [dockHeight, setDockHeight] = useState(() =>
    typeof window !== 'undefined' ? readStoredHeight() : DEFAULT_HEIGHT
  );
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(HEIGHT_KEY, String(Math.round(dockHeight)));
    } catch {
      /* ignore */
    }
  }, [dockHeight]);

  useEffect(() => {
    const onResize = () => {
      const maxH = Math.round(window.innerHeight * MAX_HEIGHT_RATIO);
      setDockHeight((h) => Math.min(h, maxH));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onResizeMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startY = e.clientY;
      const startH = dockHeight;

      const onMove = (ev) => {
        const delta = startY - ev.clientY;
        const maxH = Math.round(window.innerHeight * MAX_HEIGHT_RATIO);
        setDockHeight(Math.min(maxH, Math.max(MIN_HEIGHT, startH + delta)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [dockHeight]
  );

  if (!user || agentPlacement !== 'bottom' || !isEmbeddedAgentDockRoute(pathname)) {
    return null;
  }
  // Dashboard routes (/, /admin, /dashboard) render the dock inside UserDashboard spanning
  // all 3 content columns. Only render at App level for non-dashboard dock routes (e.g. /config).
  if (isBankingAgentDashboardRoute(pathname)) {
    return null;
  }

  const isConfigPage = pathname.replace(/\/$/, '') === '/config';

  return (
    <div
      className={`global-embedded-agent-dock-wrap${collapsed ? ' global-embedded-agent-dock-wrap--collapsed' : ''}`}
      role="region"
      aria-label={isConfigPage ? 'Application setup assistant' : 'AI banking assistant'}
      data-agent-ui="embedded"
    >
      {/* Resize handle sits at the very top — acts as the visual seam between content and dock */}
      {!collapsed && (
        <button
          type="button"
          className="embedded-dock-resize-handle"
          onMouseDown={onResizeMouseDown}
          aria-label="Drag up or down to resize assistant height"
        >
          <span className="embedded-dock-resize-handle__grip" aria-hidden>
            <span className="embedded-dock-resize-handle__bar" />
          </span>
          <span className="embedded-dock-resize-handle__label">Resize height</span>
        </button>
      )}

      <div className="embedded-agent-dock__toolbar">
        <div className="embedded-agent-dock__head">
          <h2 className="embedded-agent-dock__title">
            {isConfigPage ? 'Application setup assistant' : 'AI banking assistant'}
          </h2>
        </div>
        <button
          type="button"
          className="embedded-dock-collapse-btn"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand assistant' : 'Collapse assistant'}
        >
          {collapsed ? '▲ Expand' : '▼ Collapse'}
        </button>
      </div>

      {!collapsed && (
        <div
          className="embedded-agent-dock embedded-banking-agent embedded-banking-agent--bottom"
          style={{ '--embedded-dock-height': `${Math.round(dockHeight)}px` }}
        >
          <BankingAgent
            user={user}
            onLogout={onLogout}
            mode="inline"
            embeddedDockBottom
            embeddedFocus={isConfigPage ? 'config' : 'banking'}
          />
        </div>
      )}
    </div>
  );
}
