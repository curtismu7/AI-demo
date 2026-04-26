// banking_api_ui/src/components/RetailModeBanner.js
import React from "react";
import "./RetailModeBanner.css";

/**
 * Persistent banner shown at the top of UserDashboard (below TopNav) in both
 * Banking and Retail modes. Provides a one-click toggle between modes.
 *
 * Props:
 *   isRetail  {boolean}  — true = retail mode is active
 *   onToggle  {function} — called when the user clicks the toggle button;
 *                          caller handles PATCH + applyIndustryId side-effects
 */
export default function RetailModeBanner({ isRetail, onToggle }) {
  const label = isRetail
    ? "Retail Mode — BX Electronics"
    : "Banking Mode — BX Finance";
  const btnLabel = isRetail ? "Switch to Banking" : "Switch to Retail";

  return (
    <div
      className={`retail-mode-banner ${
        isRetail
          ? "retail-mode-banner--retail"
          : "retail-mode-banner--banking"
      }`}
      role="region"
      aria-label="Mode toggle banner"
    >
      <span className="retail-mode-banner__label">{label}</span>
      <button
        type="button"
        className={`retail-mode-banner__btn ${
          isRetail
            ? "retail-mode-banner__btn--retail"
            : "retail-mode-banner__btn--banking"
        }`}
        onClick={onToggle}
        aria-pressed={isRetail}
      >
        {btnLabel}
      </button>
    </div>
  );
}
