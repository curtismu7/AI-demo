/**
 * ArchitectureOverviewPage.js — /architecture/overview
 *
 * Simple image viewer for the architecture diagram. Used to drive a live
 * simulation overlay (regions, token side-cards, audience hops, etc.); the
 * simulation surface was too noisy for the typical "I just want to look at
 * the diagram" use case, so this page is now just a clean static view.
 *
 * The image (public/architecture/overview.png) is hand-rendered from
 * architecture.mmd at the repo root. To regenerate after editing the .mmd:
 *
 *   npx -y @mermaid-js/mermaid-cli -i architecture.mmd \
 *       -o banking_api_ui/public/architecture/overview.png -w 2400 -b transparent
 *
 * Or paste architecture.mmd into https://mermaid.live and "Download PNG".
 *
 * If you want the old simulation back, see commits before this change in
 * git log -- ArchitectureOverviewPage.js (it was ~750 lines of state
 * machine + SSE plumbing). Recommended: build a separate /simulate route
 * instead of rebuilding it under /overview.
 */
import { useState } from 'react';

const IMAGE_SRC = '/architecture/overview.png';
const IMAGE_ALT = 'Banking demo architecture: browser → BFF → MCP gateway → agent service → PingOne (OAuth + Authorize)';

export default function ArchitectureOverviewPage() {
  // Zoom is the only interaction worth keeping — the rendered Mermaid is
  // wider than most laptop screens, so a 50% / 75% / 100% / 150% step
  // gives the viewer a chance to fit it or read the labels closely.
  const [zoom, setZoom] = useState(100);

  const ZOOM_STEPS = [50, 75, 100, 150, 200];
  const zoomOut = () => setZoom((z) => {
    const idx = ZOOM_STEPS.findIndex((s) => s >= z);
    return idx > 0 ? ZOOM_STEPS[idx - 1] : z;
  });
  const zoomIn = () => setZoom((z) => {
    const idx = ZOOM_STEPS.findIndex((s) => s > z);
    return idx >= 0 ? ZOOM_STEPS[idx] : z;
  });

  return (
    <div
      style={{
        padding: '1.5rem',
        background: '#f8fafc',
        minHeight: 'calc(100vh - 64px)',
      }}
    >
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
        }}
      >
        <div style={{ marginBottom: '0.75rem' }}>
          <h1
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#0f172a',
              margin: '0 0 0.25rem 0',
            }}
          >
            Architecture Overview
          </h1>
          <p
            style={{
              fontSize: '0.9rem',
              color: '#475569',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            How a banking-demo request flows from the browser through the BFF,
            MCP gateway, agent service, and PingOne. For the step-by-step
            token-exchange walkthrough, see{' '}
            <a
              href="/sequence-diagram"
              style={{ color: '#1d4ed8', textDecoration: 'underline' }}
            >
              /sequence-diagram
            </a>
            .
          </p>
        </div>

        {/* Toolbar: zoom + image source link. No simulation controls. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            marginBottom: '0.75rem',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
            Zoom:
          </span>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= ZOOM_STEPS[0]}
            style={btnStyle(zoom <= ZOOM_STEPS[0])}
            aria-label="Zoom out"
          >
            −
          </button>
          <span
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#0f172a',
              minWidth: '3rem',
              textAlign: 'center',
            }}
          >
            {zoom}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            style={btnStyle(zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1])}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(100)}
            style={btnStyle(false)}
          >
            Reset
          </button>
          <div style={{ flex: 1 }} />
          <a
            href={IMAGE_SRC}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '0.8rem',
              color: '#1d4ed8',
              textDecoration: 'underline',
            }}
          >
            Open image in new tab
          </a>
        </div>

        {/* The image. Wrapped in a scrolling container so zooming past 100%
            doesn't push other content off the page — the user pans within
            this box instead. White background so the transparent PNG reads
            cleanly. */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            overflow: 'auto',
            maxHeight: 'calc(100vh - 220px)',
          }}
        >
          <img
            src={IMAGE_SRC}
            alt={IMAGE_ALT}
            style={{
              display: 'block',
              width: `${zoom}%`,
              height: 'auto',
              minWidth: '600px',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    background: disabled ? '#f1f5f9' : '#ffffff',
    border: '1px solid #cbd5e1',
    borderRadius: '4px',
    padding: '0.3rem 0.65rem',
    fontSize: '0.85rem',
    fontWeight: 600,
    color: disabled ? '#94a3b8' : '#0f172a',
    cursor: disabled ? 'not-allowed' : 'pointer',
    minWidth: '2rem',
  };
}
