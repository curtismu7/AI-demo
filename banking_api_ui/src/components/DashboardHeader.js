import React from 'react';
import './DashboardHeader.css';

/**
 * Branded header for Super Banking dashboards.
 * Shows the logo, "Super Banking" title, and dashboard type indicator.
 *
 * @param {'customer' | 'admin'} variant - Which dashboard this header is for
 */
const DashboardHeader = ({ variant = 'customer' }) => {
  const isAdmin = variant === 'admin';
  const label = isAdmin ? 'Admin Dashboard' : 'Customer Dashboard';

  return (
    <header className={`sb-dashboard-header sb-dashboard-header--${variant}`}>
      <div className="sb-dashboard-header__brand">
        <img
          src="/super-bank-icon.png"
          alt="Super Banking logo"
          className="sb-dashboard-header__logo"
          width="36"
          height="36"
        />
        <div className="sb-dashboard-header__titles">
          <h1 className="sb-dashboard-header__name">Super Banking</h1>
          <span className={`sb-dashboard-header__badge sb-dashboard-header__badge--${variant}`}>
            {label}
          </span>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
