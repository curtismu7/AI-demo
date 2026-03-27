import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useIndustryBranding } from '../context/IndustryBrandingContext';
import BrandLogo from './BrandLogo';
import './Footer.css';

function Footer({ user }) {
  const { theme, toggleTheme } = useTheme();
  const { preset } = useIndustryBranding();
  const isDark = theme === 'dark';

  return (
    <footer className="footer">
      <div className="footer-content">
        <BrandLogo className="footer-logo" style={{ marginRight: 8, verticalAlign: 'middle' }} height={32} width={32} />
        <span className="footer-brand-text" style={{ fontWeight: 'bold', fontSize: 18, verticalAlign: 'middle' }}>{preset.shortName} Demo</span>
        <span className="footer-copyright" style={{ marginLeft: 16, fontSize: 14 }}>
          &copy; {new Date().getFullYear()} All rights reserved.
        </span>
        <button
          type="button"
          className="footer-theme-toggle"
          onClick={() => toggleTheme()}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️ Light' : '🌙 Dark'}
        </button>
        {user && (
          <Link to="/demo-data" className="footer-demo-config" title="Sandbox accounts, balances, MFA threshold">
            Demo config
          </Link>
        )}
      </div>
    </footer>
  );
}

export default Footer;
