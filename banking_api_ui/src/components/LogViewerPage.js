import React from 'react';
import LogViewer from './LogViewer';
import { Link } from 'react-router-dom';
import './LogViewer.css';

/**
 * Full-page standalone log viewer — rendered at /logs in its own window.
 * Reuses LogViewer in standalone (non-modal) mode.
 */
export default function LogViewerPage() {
  return (
    <div className="log-page-shell">
      <div className="log-page-nav">
        <Link to="/dashboard" className="log-page-nav-btn">Dashboard</Link>
        <Link to="/admin" className="log-page-nav-btn">Admin</Link>
        <Link to="/demo-data" className="log-page-nav-btn">Demo config</Link>
      </div>
      <LogViewer standalone isOpen={true} onClose={() => window.close()} />
    </div>
  );
}
