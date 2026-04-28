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
 *   isPaused      {boolean}
 *   onPause       {function}
 *   onResume      {function}
 *   onNextStep    {function}
 *   onStop        {function}
 *   currentStep   {number}    0-based index of current step (-1 = not started)
 *   totalSteps    {number}
 *   stepDetail    {object}    Token / authorize / exchange detail object for the card
 *   stepDetailOut {object}    Second token (for RFC 8693 exchange "Request | Issued" split)
 *   isTokenExchange {boolean}
 *   isHitl       {boolean}
 *   audHops       {Array}     [{icon,label,aud,act,may_act,activeFrom,activeTo}]
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
  return lines.slice(0, 3);
}

function HighlightRect({ region, colorVariant, label }) {
  const { xPct, yPct, wPct, hPct } = region.bounds;
  const className = colorVariant
    ? `diagram-region diagram-region--${colorVariant}`
    : 'diagram-region';

  const fontSize = Math.min(2.2, Math.max(1.0, hPct * 0.18));
  const cx = xPct + wPct / 2;
  const labelLines = label ? wrapText(label, Math.floor(wPct / fontSize * 1.8)) : [];
  const textY = yPct + hPct / 2 - (labelLines.length - 1) * fontSize * 0.6;

  return (
    <g>
      <rect x={xPct} y={yPct} width={wPct} height={hPct} rx={0.8}
        className={className} aria-label={region.label}>
        <title>{region.label}</title>
      </rect>
      {colorVariant && labelLines.length > 0 && (
        <text x={cx} y={textY} textAnchor="middle" dominantBaseline="middle"
          fontSize={fontSize}
          className={`diagram-region-text diagram-region-text--${colorVariant}`}
          style={{ pointerEvents: 'none' }}>
          {labelLines.map((line, i) => (
            <tspan key={i} x={cx} dy={i === 0 ? 0 : `${fontSize * 1.25}`}>{line}</tspan>
          ))}
        </text>
      )}
    </g>
  );
}

// ─── Aud Trail ────────────────────────────────────────────────────────────────

function AudTrail({ audHops, currentStep }) {
  if (!audHops || audHops.length === 0) return null;
  return (
    <div className="arch-aud-trail">
      <span className="arch-aud-trail__label">aud trail:</span>
      {audHops.map((hop, i) => {
        const on   = currentStep >= hop.activeFrom && currentStep <= hop.activeTo;
        const past = currentStep > hop.activeTo;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className={`arch-aud-trail__arrow${past ? ' arch-aud-trail__arrow--past' : ''}`}>→</span>}
            <div className={`arch-aud-trail__hop${on ? ' arch-aud-trail__hop--on' : past ? ' arch-aud-trail__hop--past' : ''}`}>
              <span className="arch-aud-trail__icon">{hop.icon}</span>
              <span className="arch-aud-trail__name">{hop.label}</span>
              <span className="arch-aud-trail__aud">{hop.isExchange ? hop.aud : `aud: ${hop.aud}`}</span>
              {hop.act     && <span className="arch-aud-trail__act">act: {hop.act}</span>}
              {hop.may_act && <span className="arch-aud-trail__mayact">may_act: {hop.may_act}</span>}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Token card ───────────────────────────────────────────────────────────────

function TokenClaimRow({ k, v }) {
  const isHighlight = ['aud', 'decision', 'audience', 'requested_aud', 'TokenAudience', 'DecisionContext'].includes(k);
  const isAccent    = ['act', 'may_act', 'ActClientId'].includes(k);
  const isMuted     = ['type', 'note', 'grant_type', 'subject_token_type'].includes(k);
  return (
    <div className="arch-claim-row">
      <span className="arch-claim-key">{k}</span>
      <span className={`arch-claim-val${isHighlight ? ' arch-claim-val--hi' : isAccent ? ' arch-claim-val--accent' : isMuted ? ' arch-claim-val--muted' : ''}`}>
        {v}
      </span>
    </div>
  );
}

function TokenCard({ stepDetail, stepDetailOut, isTokenExchange, isHitl }) {
  if (!stepDetail) return null;
  const entries = Object.entries(stepDetail).filter(([k]) => k !== 'note');
  const note = stepDetail.note;

  const isPermit = stepDetail.decision?.includes('PERMIT') || stepDetail.decision?.includes('APPROVED');
  let cardClass = 'arch-token-card';
  if (isHitl)          cardClass += ' arch-token-card--hitl';
  else if (isTokenExchange) cardClass += ' arch-token-card--exchange';
  else if (isPermit)   cardClass += ' arch-token-card--permit';

  const header = isHitl
    ? '🧑‍⚖️  HITL'
    : isTokenExchange
    ? '🔄  RFC 8693 Token Exchange'
    : '🎫  Token on Wire';

  return (
    <div className={cardClass}>
      <div className="arch-token-card__header">{header}</div>
      {stepDetailOut ? (
        <div className="arch-token-card__split">
          <div className="arch-token-card__col">
            <div className="arch-token-card__col-label">Request</div>
            {entries.map(([k, v]) => <TokenClaimRow key={k} k={k} v={String(v)} />)}
          </div>
          <div className="arch-token-card__divider" />
          <div className="arch-token-card__col">
            <div className="arch-token-card__col-label arch-token-card__col-label--issued">↓ Issued</div>
            {Object.entries(stepDetailOut).filter(([k]) => k !== 'note').map(([k, v]) => (
              <TokenClaimRow key={k} k={k} v={String(v)} />
            ))}
          </div>
        </div>
      ) : (
        entries.map(([k, v]) => <TokenClaimRow key={k} k={k} v={String(v)} />)
      )}
      {note && <div className="arch-token-card__note">ℹ {note}</div>}
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

export default function ArchitectureDiagramPage({
  title,
  imageSrc,
  imageAlt,
  regions = [],
  activeRegions = {},
  regionLabels = {},
  onSimulate,
  isSimulating,
  isPaused,
  onPause,
  onResume,
  onNextStep,
  onStop,
  currentStep,
  totalSteps,
  stepDetail,
  stepDetailOut,
  isTokenExchange,
  isHitl,
  audHops,
}) {
  const [zoom, setZoom] = useState(1.0);

  const zoomIn    = () => setZoom((z) => Math.min(ZOOM_MAX, parseFloat((z + ZOOM_STEP).toFixed(2))));
  const zoomOut   = () => setZoom((z) => Math.max(ZOOM_MIN, parseFloat((z - ZOOM_STEP).toFixed(2))));
  const zoomReset = () => setZoom(1.0);

  const stepNum   = currentStep != null && currentStep >= 0 ? currentStep + 1 : null;
  const hasDetail = Boolean(stepDetail);

  return (
    <AdminSubPageShell title={title}>
      <div className="arch-diagram-page">

        {/* Toolbar */}
        <div className="arch-diagram-toolbar">
          <div className="arch-diagram-zoom-controls">
            <button className="arch-zoom-btn" onClick={zoomOut} title="Zoom out">−</button>
            <span className="arch-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="arch-zoom-btn" onClick={zoomIn}  title="Zoom in">+</button>
            <button className="arch-zoom-btn arch-zoom-reset" onClick={zoomReset} title="Reset zoom">↺</button>
          </div>

          {isSimulating && stepNum != null && (
            <div className="arch-step-controls">
              <span className={`arch-step-label${isPaused ? ' arch-step-label--paused' : ''}`}>
                {isPaused ? '⏸ Paused' : '▶'} Step {stepNum}/{totalSteps}
              </span>
              {!isPaused && <button className="arch-ctrl-btn arch-ctrl-btn--pause" onClick={onPause}>Pause</button>}
              {isPaused  && <button className="arch-ctrl-btn arch-ctrl-btn--resume" onClick={onResume}>Resume</button>}
              {isPaused  && <button className="arch-ctrl-btn arch-ctrl-btn--next" onClick={onNextStep}>Next Step →</button>}
              <button className="arch-ctrl-btn arch-ctrl-btn--stop" onClick={onStop}>Stop</button>
            </div>
          )}

          {onSimulate && !isSimulating && (
            <button className="arch-simulate-btn" onClick={onSimulate} disabled={isSimulating}>
              ▶ Simulate Flow
            </button>
          )}
        </div>

        {/* Aud trail */}
        {isSimulating && audHops && (
          <AudTrail audHops={audHops} currentStep={currentStep} />
        )}

        {/* Body: diagram + optional token card */}
        <div className={`arch-diagram-body${hasDetail && isSimulating ? ' arch-diagram-body--with-card' : ''}`}>
          <div className="arch-diagram-scroll-wrapper">
            <div className="arch-diagram-container" style={{ width: `${zoom * 100}%` }}>
              <img src={imageSrc} alt={imageAlt || title} className="arch-diagram-img" />
              <svg className="arch-diagram-svg" viewBox="0 0 100 100"
                preserveAspectRatio="none" aria-hidden="true">
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

          {hasDetail && isSimulating && (
            <div className="arch-token-side">
              <TokenCard
                stepDetail={stepDetail}
                stepDetailOut={stepDetailOut}
                isTokenExchange={isTokenExchange}
                isHitl={isHitl}
              />
            </div>
          )}
        </div>

      </div>
    </AdminSubPageShell>
  );
}
