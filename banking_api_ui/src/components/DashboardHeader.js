import React from 'react';
import './DashboardHeader.css';
import { useTheme } from '../context/ThemeContext';

/**
 * Branded header for Super Banking dashboards.
 * Shows the logo, "Super Banking" title, and dashboard type indicator.
 *
 * @param {'customer' | 'admin'} variant - Which dashboard this header is for
 */
const DashboardHeader = ({ variant = 'customer' }) => {
  const { identity } = useTheme();
  const isAdmin = variant === 'admin';
  const label = isAdmin ? 'Admin Dashboard' : 'Customer Dashboard';
  const title = (identity && identity.headerTitle) || 'Super Banking';
  const logoAlt = (identity && identity.logoAlt) || 'Super Banking logo';
  const logoSrc = (identity && identity.logoPath) || '/super-bank-icon.png';

  return (
    <header className={`sb-dashboard-header sb-dashboard-header--${variant}`}>
      <div className="sb-dashboard-header__brand">
        <img
          src={logoSrc}
          alt={logoAlt}
          className="sb-dashboard-header__logo"
          width="36"
          height="36"
        />
        <div className="sb-dashboard-header__titles">
          <h1 className="sb-dashboard-header__name">{title}</h1>
          <span className={`sb-dashboard-header__badge sb-dashboard-header__badge--${variant}`}>
            {label}
          </span>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
