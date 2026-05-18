/**
 * Small pure helpers extracted from BankingAgent for testability.
 * Keep this dependency-free.
 */

/**
 * Atomically read-and-delete a sessionStorage key.
 * Returns the trimmed string value, or null if absent/blank/unavailable.
 * Guarantees a second caller (another mounted instance, a later retry) gets null,
 * so a post-OAuth NL command replays exactly once.
 */
export function claimPendingNl(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw == null) return null;
    sessionStorage.removeItem(key);
    const trimmed = String(raw).trim();
    return trimmed ? trimmed : null;
  } catch (_) {
    return null;
  }
}

/**
 * Clamp a floating-panel top-left so at least a grab strip of the header
 * stays on screen. Used on drag-end and on window resize (NOT during an
 * active drag — second-monitor drag is intentional).
 *
 * @param {{x:number,y:number}} pos
 * @param {{width:number,height:number}} panel
 * @param {{width:number,height:number}} viewport
 * @param {number} margin minimum visible px of the panel on each axis
 * @returns {{x:number,y:number}}
 */
export function clampPanelPosition(pos, panel, viewport, margin = 48) {
  const maxX = Math.max(0, viewport.width - margin);
  const maxY = Math.max(0, viewport.height - margin);
  const minX = margin - panel.width;
  const minY = 0; // header is at the top; never let it go above the viewport
  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y: Math.min(maxY, Math.max(minY, pos.y)),
  };
}
