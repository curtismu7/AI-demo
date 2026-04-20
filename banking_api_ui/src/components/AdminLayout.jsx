import React from 'react';
import AdminSideNav from './AdminSideNav';
import './AdminLayout.css';

/**
 * AdminLayout — Professional banking layout with sidebar.
 * Global header is now in App.js
 * 
 * Usage: Wrap admin pages with <AdminLayout>{content}</AdminLayout>
 */
export default function AdminLayout({ children }) {
  return (
    <div className="admin-layout">
      <AdminSideNav />
      <div className="admin-layout__main">
        {children}
      </div>
    </div>
  );
}
