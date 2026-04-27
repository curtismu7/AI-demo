/**
 * ArchitectureDiagramPage.js
 *
 * Shared display component for architecture diagram pages.
 * Renders a static PNG image with an absolutely-positioned SVG overlay.
 * Regions highlight when activeRegions[regionId] is set by the parent page.
 *
 * Props:
 *   title         {string}    Page heading shown in AdminSubPageShell
 *   imageSrc      {string}    Path to PNG (e.g. '/architecture/overview.png')
 *   imageAlt      {string}    Alt text for the diagram image
 *   regions       {Region[]}  Array from diagram-*-regions.js config files
 *   activeRegions {object}    { [regionId]: 'active' | 'active-error' | 'active-permit' }
 *   onSimulate    {function}  Called when Simulate Flow button clicked (optional)
 *   isSimulating  {boolean}   Disables simulate button while running
 */
import React, { useState } from 'react';
import AdminSubPageShell from './AdminSubPageShell';
import './ArchitectureDiagramPage.css';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4.0;

function HighlightRect({ region, colorVariant }) {
  const { xPct, yPct, wPct, hPct } = region.bounds;
  const className = colorVariant
    ? `diagram-region diagram-region--${colorVariant}`
    : 'diagram-region';

  return (
    <rect
      x={`${xPct}%`}
      y={`${yPct}%`}
      width={`${wPct}%`}
      height={`${hPct}%`}
      rx="4"
      className={className}
      aria-label={region.label}
    >
      <title>{region.label}</title>
    </rect>
  );
}

export default function ArchitectureDiagramPage({
  title,
  imageSrc,
  imageAlt,
  regions = [],
  activeRegions = {},
  onSimulate,
  isSimulating,
}) {
  const [zoom, setZoom] = useState(1.0);

  const zoomIn  = () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));
  const zoomReset = () => setZoom(1.0);

  return (
    <AdminSubPageShell title={title}>
      <div className="arch-diagram-page">

        <div className="arch-diagram-toolbar">
          <div className="arch-diagram-zoom-controls">
            <button className="arch-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
            <span className="arch-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="arch-zoom-btn" onClick={zoomIn} title="Zoom in">+</button>
            <button className="arch-zoom-btn arch-zoom-reset" onClick={zoomReset} title="Reset zoom">↺</button>
          </div>
          {onSimulate && (
            <button
              className={`arch-simulate-btn${isSimulating ? ' arch-simulate-btn--running' : ''}`}
              onClick={onSimulate}
              disabled={isSimulating}
            >
              {isSimulating ? '⏳ Simulating…' : '▶ Simulate Flow'}
            </button>
          )}
        </div>

        <div className="arch-diagram-scroll-wrapper">
          <div
            className="arch-diagram-container"
            style={{ width: `${zoom * 100}%` }}
          >
            <img
              src={imageSrc}
              alt={imageAlt || title}
              className="arch-diagram-img"
            />
            <svg
              className="arch-diagram-svg"
              aria-hidden="true"
              role="presentation"
            >
              {regions.map((region) => (
                <HighlightRect
                  key={region.id}
                  region={region}
                  colorVariant={activeRegions[region.id] || null}
                />
              ))}
            </svg>
          </div>
        </div>

      </div>
    </AdminSubPageShell>
  );
}
