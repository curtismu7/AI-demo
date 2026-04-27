/**
 * ArchitectureDiagramPage.js
 *
 * Shared display component for architecture diagram pages.
 * Renders a static PNG image with an absolutely-positioned SVG overlay.
 * Regions highlight when activeRegions[regionId] is set by the parent page.
 *
 * Props:
 *   title        {string}    Page heading shown in AdminSubPageShell
 *   imageSrc     {string}    Path to PNG (e.g. '/architecture/overview.png')
 *   imageAlt     {string}    Alt text for the diagram image
 *   regions      {Region[]}  Array from diagram-*-regions.js config files
 *   activeRegions {object}   { [regionId]: 'active' | 'active-error' | 'active-permit' }
 *   user         {object|null} Pass-through; non-admin users see static diagram + notice
 */
import React from 'react';
import AdminSubPageShell from './AdminSubPageShell';
import './ArchitectureDiagramPage.css';

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
  user,
}) {
  return (
    <AdminSubPageShell title={title}>
      <div className="arch-diagram-page">
        <div className="arch-diagram-container">
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
    </AdminSubPageShell>
  );
}
