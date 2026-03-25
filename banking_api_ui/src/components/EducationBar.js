// banking_api_ui/src/components/EducationBar.js
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useEducationUI } from '../context/EducationUIContext';
import { EDU } from './education/educationIds';
import './EducationBar.css';

/**
 * Global learn pill bar for authenticated users (below main header area).
 */
export default function EducationBar() {
  const { open } = useEducationUI();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const openCiba = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('education-open-ciba', { detail: { tab: 'what' } }));
    }
    setMenuOpen(false);
  };

  const openCimd = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('education-open-cimd', { detail: { tab: 'what' } }));
    }
    setMenuOpen(false);
  };

  return (
    <div className="edu-bar" role="navigation" aria-label="Learn topics">
      <div className="edu-bar-inner">
        <div className="dropdown edu-bar-group" ref={menuRef}>
          <button
            type="button"
            className="btn btn-sm btn-outline-primary edu-bar-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            OAuth Flows
          </button>
          {menuOpen && (
            <div className="dropdown-menu show edu-bar-dropdown" role="menu">
              <button type="button" className="dropdown-item" role="menuitem" onClick={() => { open(EDU.LOGIN_FLOW, 'what'); setMenuOpen(false); }}>
                Authorization Code + PKCE
              </button>
              <button type="button" className="dropdown-item" role="menuitem" onClick={() => { open(EDU.LOGIN_FLOW, 'ciba'); setMenuOpen(false); }}>
                CIBA (OOB) — short (drawer)
              </button>
              <button type="button" className="dropdown-item" role="menuitem" onClick={() => { openCiba(); }}>
                CIBA — full guide (floating)
              </button>
              <button type="button" className="dropdown-item" role="menuitem" onClick={() => { open(EDU.TOKEN_EXCHANGE, 'why'); setMenuOpen(false); }}>
                Token Exchange (RFC 8693)
              </button>
            </div>
          )}
        </div>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.TOKEN_EXCHANGE, 'why')}>
          Token Exchange
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.MAY_ACT, 'what')}>
          may_act / act
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.LOGIN_FLOW, 'pkce')}>
          PKCE
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={openCiba}>
          CIBA
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.MCP_PROTOCOL, 'what')}>
          MCP Protocol
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.INTROSPECTION, 'why')}>
          Introspection
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.AGENT_GATEWAY, 'overview')}>
          Agent Gateway
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={() => open(EDU.RFC_INDEX, 'index')}>
          RFC Index
        </button>
        <button type="button" className="btn btn-sm btn-outline-primary edu-bar-btn" onClick={openCimd}>
          CIMD
        </button>
        <Link
          to="/demo-data"
          className="btn btn-sm btn-outline-primary edu-bar-btn"
          title="Sandbox accounts, balances, MFA threshold"
        >
          Demo config
        </Link>
      </div>
    </div>
  );
}
