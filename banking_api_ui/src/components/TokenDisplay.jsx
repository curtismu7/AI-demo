import React, { useState } from 'react';
import apiClient from '../services/apiClient';
import './TokenDisplay.css';

/**
 * TokenDisplay - Component for displaying JWT tokens with collapsible sections
 * Shows decoded claims, token summary, and allows expansion/collapse
 */
export default function TokenDisplay({ token, label, showFullToken = false }) {
  const [decoded, setDecoded] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDecode = async () => {
    if (!token) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data } = await apiClient.post('/api/token-display/decode', {
        token,
        includeFullToken: showFullToken,
        includeClaims: true
      });
      
      if (data.success) {
        setDecoded(data);
        setExpanded(true);
      } else {
        setError(data.error || 'Failed to decode token');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to decode token');
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = () => {
    if (!decoded) {
      handleDecode();
    } else {
      setExpanded(!expanded);
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const renderClaim = (key, claim) => (
    <div key={key} className="token-claim">
      <div className="token-claim-key">{key}</div>
      <div className="token-claim-value">
        {typeof claim.value === 'object' ? (
          <pre className="token-claim-object">{JSON.stringify(claim.value, null, 2)}</pre>
        ) : (
          String(claim.value)
        )}
      </div>
      {claim.description && (
        <div className="token-claim-description">{claim.description}</div>
      )}
    </div>
  );

  if (!token) {
    return (
      <div className="token-display token-display--empty">
        <span className="token-display-label">{label || 'Token'}</span>
        <span className="token-display-value">No token available</span>
      </div>
    );
  }

  return (
    <div className="token-display">
      <div className="token-display-header" onClick={toggleExpand}>
        <span className="token-display-label">{label || 'Token'}</span>
        <span className="token-display-toggle">
          {expanded ? '▼' : '▶'}
        </span>
      </div>
      
      {error && (
        <div className="token-display-error">
          Error: {error}
        </div>
      )}
      
      {loading && (
        <div className="token-display-loading">
          Decoding token...
        </div>
      )}
      
      {expanded && decoded && decoded.success && (
        <div className="token-display-content">
          {/* Token Summary */}
          {decoded.summary && (
            <div className="token-summary">
              <h4>Token Summary</h4>
              <div className="token-summary-grid">
                <div className="token-summary-item">
                  <span className="token-summary-label">Type:</span>
                  <span className="token-summary-value">{decoded.summary.tokenType}</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-label">Subject:</span>
                  <span className="token-summary-value">{decoded.summary.subject || 'N/A'}</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-label">Issuer:</span>
                  <span className="token-summary-value">{decoded.summary.issuer || 'N/A'}</span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-label">Audience:</span>
                  <span className="token-summary-value">
                    {Array.isArray(decoded.summary.audience) 
                      ? decoded.summary.audience.join(', ') 
                      : decoded.summary.audience || 'N/A'}
                  </span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-label">Expires:</span>
                  <span className={`token-summary-value ${decoded.summary.expired ? 'token-expired' : 'token-valid'}`}>
                    {formatTimestamp(decoded.summary.expiresAt)}
                    {decoded.summary.expired && ' (EXPIRED)'}
                  </span>
                </div>
                <div className="token-summary-item">
                  <span className="token-summary-label">Issued At:</span>
                  <span className="token-summary-value">{formatTimestamp(decoded.summary.issuedAt)}</span>
                </div>
                {decoded.summary.hasActor && (
                  <div className="token-summary-item token-summary-item--actor">
                    <span className="token-summary-label">Actor:</span>
                    <span className="token-summary-value">
                      {decoded.summary.actor?.clientId || 'N/A'}
                    </span>
                  </div>
                )}
                {decoded.summary.scopes && decoded.summary.scopes.length > 0 && (
                  <div className="token-summary-item token-summary-item--scopes">
                    <span className="token-summary-label">Scopes:</span>
                    <div className="token-summary-scopes">
                      {decoded.summary.scopes.map((scope, idx) => (
                        <span key={idx} className="token-scope-badge">{scope}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Header */}
          {decoded.decoded?.header && (
            <div className="token-section">
              <h4>Header</h4>
              <pre className="token-section-content">
                {JSON.stringify(decoded.decoded.header, null, 2)}
              </pre>
            </div>
          )}
          
          {/* Payload/Claims */}
          {decoded.decoded?.payload && (
            <div className="token-section">
              <h4>Payload (Claims)</h4>
              <div className="token-claims">
                {Object.entries(decoded.decoded.payload).map(([key, claim]) => 
                  renderClaim(key, claim)
                )}
              </div>
            </div>
          )}
          
          {/* Full Token (if enabled) */}
          {showFullToken && decoded.fullToken && (
            <div className="token-section">
              <h4>Full Token</h4>
              <pre className="token-section-content token-full-token">
                {decoded.fullToken}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
