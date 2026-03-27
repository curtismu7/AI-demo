// banking_api_ui/src/components/EducationBar.js
import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import AgentUiModeToggle from './AgentUiModeToggle';
import { useDemoMode } from '../hooks/useDemoMode';
import './EducationBar.css';

/**
 * Top-right hamburger: Agent UI + OAuth/learn shortcuts (full mode) or Agent UI only (DEMO_MODE).
 */
export default function EducationBar() {
  const demoMode = useDemoMode();
  const { open } = useEducationUI();
  const [panelOpen, setPanelOpen] = useState(false);
  const menuRef = useRef(null);

  const close = () => setPanelOpen(false);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!panelOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const openCiba = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } }));
    }
    close();
  };

  const openCimd = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: 'what' } }));
    }
    close();
  };

  const openApiTraffic = () => {
    window.open('/api-traffic', 'ApiTraffic', 'width=1400,height=900,scrollbars=yes,resizable=yes');
    close();
  };

  if (demoMode === true) {
    return (
      <div className="edu-bar edu-bar--dock" ref={menuRef}>
        <button
          type="button"
          className="edu-bar-hamburger"
          aria-expanded={panelOpen}
          aria-controls="edu-bar-panel"
          aria-label="Agent UI menu"
          onClick={() => setPanelOpen((o) => !o)}
        >
          <span className="edu-bar-hamburger__line" aria-hidden="true" />
          <span className="edu-bar-hamburger__line" aria-hidden="true" />
          <span className="edu-bar-hamburger__line" aria-hidden="true" />
        </button>
        {panelOpen && (
          <div
            id="edu-bar-panel"
            className="edu-bar-panel edu-bar-panel--minimal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edu-bar-panel-title"
          >
            <h2 id="edu-bar-panel-title" className="edu-bar-panel__title">
              Agent UI
            </h2>
            <AgentUiModeToggle variant="eduBar" className="edu-bar-agent-toggle" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="edu-bar edu-bar--dock" ref={menuRef}>
      <button
        type="button"
        className="edu-bar-hamburger"
        aria-expanded={panelOpen}
        aria-controls="edu-bar-panel"
        aria-label="Learn topics and agent UI"
        onClick={() => setPanelOpen((o) => !o)}
      >
        <span className="edu-bar-hamburger__line" aria-hidden="true" />
        <span className="edu-bar-hamburger__line" aria-hidden="true" />
        <span className="edu-bar-hamburger__line" aria-hidden="true" />
      </button>
      {panelOpen && (
        <div
          id="edu-bar-panel"
          className="edu-bar-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edu-bar-panel-title"
        >
          <h2 id="edu-bar-panel-title" className="edu-bar-panel__title">
            Learn &amp; agent
          </h2>

          <div className="edu-bar-panel__section">
            <AgentUiModeToggle variant="eduBar" className="edu-bar-agent-toggle" />
          </div>

          <div className="edu-bar-panel__section">
            <button
              type="button"
              className="edu-bar-panel__btn edu-bar-panel__btn--featured"
              onClick={() => {
                open(EDU.BEST_PRACTICES, 'overview');
                close();
              }}
            >
              ⭐ AI Agent Best Practices
            </button>
          </div>

          <div className="edu-bar-panel__section">
            <p className="edu-bar-panel__heading">OAuth flows</p>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.LOGIN_FLOW, 'what');
                close();
              }}
            >
              Authorization Code + PKCE
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.LOGIN_FLOW, 'ciba');
                close();
              }}
            >
              CIBA (OOB) — short (drawer)
            </button>
            <button type="button" className="edu-bar-panel__btn" onClick={openCiba}>
              CIBA — full guide (floating)
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.TOKEN_EXCHANGE, 'why');
                close();
              }}
            >
              Token Exchange (RFC 8693)
            </button>
          </div>

          <div className="edu-bar-panel__section">
            <p className="edu-bar-panel__heading">Shortcuts</p>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.TOKEN_EXCHANGE, 'why');
                close();
              }}
            >
              Token Exchange
            </button>
            <NavLink
              to="/demo-data"
              className={({ isActive }) =>
                `edu-bar-panel__btn edu-bar-panel__link${isActive ? ' edu-bar-panel__link--active' : ''}`
              }
              title="Sandbox accounts, balances, profile, MFA threshold, agent layout"
              onClick={close}
            >
              Demo config
            </NavLink>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.MAY_ACT, 'what');
                close();
              }}
            >
              may_act / act
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.LOGIN_FLOW, 'pkce');
                close();
              }}
            >
              PKCE
            </button>
            <button type="button" className="edu-bar-panel__btn" onClick={openCiba}>
              CIBA
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.MCP_PROTOCOL, 'what');
                close();
              }}
            >
              MCP Protocol
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.INTROSPECTION, 'why');
                close();
              }}
            >
              Introspection
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.AGENT_GATEWAY, 'overview');
                close();
              }}
            >
              Agent Gateway
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.HUMAN_IN_LOOP, 'what');
                close();
              }}
            >
              Human-in-the-loop
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={() => {
                open(EDU.RFC_INDEX, 'index');
                close();
              }}
            >
              RFC Index
            </button>
            <button type="button" className="edu-bar-panel__btn" onClick={openCimd}>
              CIMD
            </button>
            <button
              type="button"
              className="edu-bar-panel__btn"
              onClick={openApiTraffic}
              title="Open API Traffic Viewer in new window"
            >
              🌐 API
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
