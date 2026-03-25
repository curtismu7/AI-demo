import React from 'react';
import LogViewer from './LogViewer';

/**
 * Full-page standalone log viewer — rendered at /logs in its own window.
 * Reuses LogViewer in standalone (non-modal) mode.
 */
export default function LogViewerPage() {
  return <LogViewer standalone isOpen={true} onClose={() => window.close()} />;
}
