import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

function Footer({ user }) {
  return (
    <footer className="footer">
      <div className="footer-content">
        <img src="/logo.svg" alt="Banking App Logo" className="footer-logo" style={{ height: 32, marginRight: 8, verticalAlign: 'middle' }} />
        <span style={{ fontWeight: 'bold', fontSize: 18, verticalAlign: 'middle' }}>Banking Demo</span>
        <span style={{ marginLeft: 16, color: '#888', fontSize: 14 }}>
          &copy; {new Date().getFullYear()} All rights reserved.
        </span>
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
