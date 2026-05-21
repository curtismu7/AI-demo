// banking_api_ui/src/components/ApiTrafficPage.js
/**
 * Standalone full-page API Traffic Viewer.
 * Opened via window.open('/api-traffic') so it runs in its own browser window.
 * Reads live data from localStorage (written by the main-window apiTrafficStore).
 */
import React, { useState, useEffect } from 'react';
import ApiTrafficPanel from './ApiTrafficPanel';
import { seedFromLocalStorage } from '../services/apiTrafficStore';
import { useTheme } from '../context/ThemeContext';
import './ApiTrafficPanel.css';

export default function ApiTrafficPage() {
  const { theme, toggleTheme } = useTheme();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Seed in-memory store from localStorage on first load
    seedFromLocalStorage();
    setReady(true);

    // When the main window writes new entries, re-seed so this page updates
    const handleStorage = (e) => {
      if (e.key === 'api-traffic-store') seedFromLocalStorage();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!ready) return null;

  return (
    <div className="api-traffic-page-host">
      <div style={{ 
        position: 'absolute', 
        top: '10px', 
        right: '10px', 
        zIndex: 1000 
      }}>
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--surface-1, #f8fafc)',
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
            color: 'var(--text-primary, #1e293b)'
          }}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
      <ApiTrafficPanel />
    </div>
  );
}
