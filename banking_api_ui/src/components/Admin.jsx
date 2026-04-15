import React, { useState, useEffect } from 'react';
import TokenSecurityTester from '../components/TokenSecurityTester';
import apiClient from '../services/apiClient';
import './Admin.css';

/**
 * Admin Dashboard Page
 * Administrative interface for system management and security testing
 * 
 * Phase 158: Includes Token Security Tester for educational demonstrations
 */
export default function Admin() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadAdminStats();
  }, []);

  const loadAdminStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await apiClient.get('/api/admin/stats');
      setStats(response.data.stats);
    } catch (err) {
      console.error('[Admin] Error loading stats:', err);
      setError(
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to load admin statistics'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <p className="admin-subtitle">System management and security configuration</p>
      </div>

      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button
          className={`admin-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          System Overview
        </button>
        <button
          className={`admin-tab ${activeTab === 'security' ? 'active' : ''}`}
          onClick={() => setActiveTab('security')}
        >
          🔐 Security Testing
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="admin-section">
          <h2>System Overview</h2>
          
          {loading && (
            <div className="admin-loading">
              <p>Loading system statistics...</p>
            </div>
          )}

          {error && (
            <div className="admin-error">
              <strong>Error:</strong> {error}
              <button onClick={loadAdminStats} className="admin-retry-button">
                Try Again
              </button>
            </div>
          )}

          {stats && (
            <div className="admin-stats-grid">
              <div className="stat-card">
                <div className="stat-value">{stats.totalUsers}</div>
                <div className="stat-label">Total Users</div>
                <div className="stat-subtext">
                  {stats.activeUsers} active
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{stats.totalAccounts}</div>
                <div className="stat-label">Bank Accounts</div>
                <div className="stat-subtext">
                  {stats.activeAccounts} active
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-value">${(stats.totalBalance / 1000).toFixed(0)}K</div>
                <div className="stat-label">Total Balance</div>
                <div className="stat-subtext">
                  Avg: ${stats.averageBalance?.toFixed(0)}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{stats.totalTransactions}</div>
                <div className="stat-label">Transactions</div>
                <div className="stat-subtext">All time</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security Testing Tab */}
      {activeTab === 'security' && (
        <div className="admin-section">
          <h2>Token Security Testing</h2>
          <p className="admin-section-description">
            Test how the MCP server validates tokens and rejects requests that violate
            security controls. Each scenario demonstrates a different security validation.
          </p>
          
          <div className="admin-token-tester-wrapper">
            <TokenSecurityTester />
          </div>
        </div>
      )}
    </div>
  );
}
