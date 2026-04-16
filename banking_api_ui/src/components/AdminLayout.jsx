import React from 'react';
import AdminSideNav from './AdminSideNav';
import './AdminLayout.css';

/**
 * AdminLayout — Wrapper layout that includes the PingIdentity-style sidebar
 * and adjusts the main content area accordingly.
 * 
 * Usage: Wrap admin pages with <AdminLayout>{content}</AdminLayout>
 */
export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminSideNav />
      <div className="admin-layout__content">
        {children}
      </div>
    </div>
  );
}
