/**
 * ArchitectureDiagramPage.js
 *
 * Shared display component for architecture diagram pages.
 * Renders a PNG image with an absolutely-positioned SVG overlay.
 *
 * The SVG uses viewBox="0 0 100 100" + preserveAspectRatio="none" so region
 * coordinates and font sizes are all in the same 0-100 unit space.
 *
 * Props:
 *   title         {string}    Page heading
 *   imageSrc      {string}    Path to PNG
 *   imageAlt      {string}    Alt text
 *   regions       {Region[]}  Array from diagram-*-regions.js
 *   activeRegions {object}    { [regionId]: 'active' | 'active-prev' | 'active-error' | 'active-permit' }
 *   regionLabels  {object}    { [regionId]: string } — explanation shown inside the box
 *   onSimulate    {function}  Simulate Flow button handler (optional)
 *   isSimulating  {boolean}   Disables simulate button while running
 */
import React, { useState } from 'react';
import AdminSubPageShell from './AdminSubPageShell';
import './ArchitectureDiagramPage.css';

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4.0;

function wrapText(text, maxChars) {
  if (!text || text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 3); // max 3 lines
}

function HighlightRect({ region, colorVariant, label }) {
  const { xPct, yPct, wPct, hPct } = region.bounds;
  const className = colorVariant
    ? `diagram-region diagram-region--${colorVariant}`
    : 'diagram-region';

  // Font size: scales with box height in 0-100 viewBox units
  const fontSize = Math.min(2.2, Math.max(1.0, hPct * 0.18));
  const cx = xPct + wPct / 2;
  const labelLines = label ? wrapText(label, Math.floor(wPct / fontSize * 1.8)) : [];
  const textY = yPct + hPct / 2 - (labelLines.length - 1) * fontSize * 0.6;

  return (
    <g>
      <rect
        x={xPct}
        y={yPct}
        width={wPct}
        height={hPct}
        rx={0.8}
        className={className}
        aria-label={region.label}
      >
        <title>{region.label}</title>
      </rect>
      {colorVariant && labelLines.length > 0 && (
        <text
          x={cx}
          y={textY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          className={`diagram-region-text diagram-region-text--${colorVariant}`}
          style={{ pointerEvents: 'none' }}
        >
          {labelLines.map((line, i) => (
            <tspan key={i} x={cx} dy={i === 0 ? 0 : `${fontSize * 1.25}`}>
              {line}
            </tspan>
          ))}
        </text>
      )}
    </g>
  );
}

export default function ArchitectureDiagramPage({
  title,
  imageSrc,
  imageAlt,
  regions = [],
  activeRegions = {},
  regionLabels = {},
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
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {regions.map((region) => (
                <HighlightRect
                  key={region.id}
                  region={region}
                  colorVariant={activeRegions[region.id] || null}
                  label={regionLabels[region.id] || null}
                />
              ))}
            </svg>
          </div>
        </div>

      </div>
    </AdminSubPageShell>
  );
}
