// banking_api_ui/src/components/SideAgentDock.js
import React, { useCallback, useEffect, useRef, useState } from 'react';
import BankingAgent from './BankingAgent';
import './SideAgentDock.css';

const WIDTH_KEY = 'side_agent_dock_width_px';
const COLLAPSE_KEY = 'side_agent_dock_collapsed';
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 280;
const MAX_WIDTH = 520;

function readStoredWidth() {
  try {
    const n = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10);
    if (Number.isFinite(n) && n >= MIN_WIDTH) return Math.min(n, MAX_WIDTH);
  } catch {
    /* ignore */
  }
  return DEFAULT_WIDTH;
}

function readStoredCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Side-panel AI agent dock: fixed left or right sidebar, collapsible, width-resizable.
 * @param {{ user: object, onLogout: function, side: 'left' | 'right' }} props
 */
export default function SideAgentDock({ user, onLogout, side }) {
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const [widthPx, setWidthPx] = useState(readStoredWidth);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_WIDTH);

  // Persist collapsed state
  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  // Persist width and sync CSS custom property
  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(Math.round(widthPx)));
    } catch {
      /* ignore */
    }
    document.documentElement.style.setProperty('--side-dock-width', `${widthPx}px`);
  }, [widthPx]);

  // Apply body-shift class while this dock is mounted and open
  useEffect(() => {
    const openClass = `app-has-side-dock-${side}--open`;
    const mountClass = `app-has-side-dock-${side}`;
    document.documentElement.classList.add(mountClass);
    if (!collapsed) {
      document.documentElement.classList.add(openClass);
    } else {
      document.documentElement.classList.remove(openClass);
    }
    return () => {
      document.documentElement.classList.remove(mountClass);
      document.documentElement.classList.remove(openClass);
    };
  }, [side, collapsed]);

  // Resize drag handlers
  const handleResizeMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = widthPx;

      const onMouseMove = (ev) => {
        if (!isDraggingRef.current) return;
        let newWidth;
        if (side === 'left') {
          newWidth = startWidthRef.current + (ev.clientX - startXRef.current);
        } else {
          newWidth = startWidthRef.current - (ev.clientX - startXRef.current);
        }
        newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
        setWidthPx(newWidth);
      };

      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [side, widthPx]
  );

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  const collapseLabel = collapsed
    ? 'Expand agent sidebar'
    : 'Collapse agent sidebar';

  const collapseIcon =
    side === 'left'
      ? collapsed ? '›' : '‹'
      : collapsed ? '‹' : '›';

  return (
    <div
      className={[
        'side-agent-dock',
        `side-agent-dock--${side}`,
        collapsed ? 'side-agent-dock--collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: collapsed ? 0 : widthPx }}
    >
      {/* Width resize drag handle — positioned on the inner edge */}
      <div
        className="side-agent-dock__resize-handle"
        onMouseDown={handleResizeMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize agent sidebar"
        tabIndex={0}
      />

      {/* Collapse / expand tab on the outer edge */}
      <button
        className="side-agent-dock__collapse-btn"
        onClick={toggleCollapsed}
        type="button"
        aria-label={collapseLabel}
      >
        {collapseIcon}
      </button>

      {/* Agent body — hidden when collapsed */}
      {!collapsed && (
        <div className="side-agent-dock__body">
          <BankingAgent
            mode="inline"
            user={user}
            onLogout={onLogout}
            splitColumnChrome={false}
          />
        </div>
      )}
    </div>
  );
}
