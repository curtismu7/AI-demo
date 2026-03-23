// banking_api_ui/src/components/shared/EducationDrawer.js
import React, { useState, useEffect } from 'react';
import './EducationDrawer.css';

/**
 * Slide-in drawer shell with pill tabs (same family as CIBA panel).
 */
export default function EducationDrawer({
  isOpen,
  onClose,
  title,
  tabs,
  initialTabId,
  width = 'min(520px, 100vw)',
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);

  useEffect(() => {
    if (!isOpen) return;
    if (initialTabId && tabs.some((t) => t.id === initialTabId)) {
      setActiveId(initialTabId);
    } else {
      setActiveId((prev) => (tabs.find((t) => t.id === prev) ? prev : tabs[0]?.id));
    }
  }, [isOpen, initialTabId, tabs]);

  if (!isOpen) return null;

  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  return (
    <>
      <div className="edu-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="edu-drawer"
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="edu-drawer-header">
          <h2 className="edu-drawer-title">{title}</h2>
          <button type="button" className="edu-drawer-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="edu-drawer-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeId === t.id}
              className={`edu-drawer-tab${activeId === t.id ? ' edu-drawer-tab--active' : ''}`}
              onClick={() => setActiveId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="edu-drawer-body scroll-area">
          {active?.content}
        </div>
      </div>
    </>
  );
}
