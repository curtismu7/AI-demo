// banking_api_ui/src/components/shared/EducationModal.js
import React, { useState, useEffect, useRef } from 'react';
import './EducationDrawer.css';

/**
 * Full-screen modal for large diagrams (Agent Gateway).
 */
export default function EducationModal({
  isOpen,
  onClose,
  title,
  tabs,
  initialTabId,
}) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      wasOpenRef.current = false;
      return;
    }
    const justOpened = !wasOpenRef.current;
    wasOpenRef.current = true;
    if (!justOpened) return;

    if (initialTabId && tabs.some((t) => t.id === initialTabId)) {
      setActiveId(initialTabId);
    } else {
      setActiveId(tabs[0]?.id);
    }
  }, [isOpen, initialTabId, tabs]);

  if (!isOpen) return null;

  const active = tabs.find((t) => t.id === activeId) || tabs[0];

  return (
    <>
      <div className="edu-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <div
        className="edu-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edu-modal-title"
      >
        <div className="edu-modal-inner">
          <div className="edu-drawer-topbar">
            <div className="edu-drawer-tabs" role="tablist" aria-label="Section">
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
            <button type="button" className="edu-drawer-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="edu-drawer-title-row">
            <h2 id="edu-modal-title" className="edu-drawer-title">{title}</h2>
          </div>
          <div className="edu-modal-body scroll-area">
            {active?.content}
          </div>
        </div>
      </div>
    </>
  );
}
