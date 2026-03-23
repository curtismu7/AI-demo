import React, { useState, useEffect } from 'react';
import apiClient from '../services/apiClient';
import './TokenChainDisplay.css';

const TokenChainDisplay = () => {
  const [tokens, setTokens] = useState([
    {
      id: 'banking-app-token',
      name: 'Banking Application Token',
      status: 'active',
      content: null,
      error: null
    },
    {
      id: 'agent-token',
      name: 'Agent Token',
      status: 'active',
      content: null,
      error: null
    },
    {
      id: 'exchanged-token-mcp',
      name: 'Exchanged Token (MCPServer)',
      status: 'acquiring',
      content: null,
      error: null
    },
    {
      id: 'mcp-server-token',
      name: 'MCPServer Token',
      status: 'acquiring',
      content: null,
      error: null
    },
    {
      id: 'mcp-exchanged-token',
      name: 'MCPServerExchangedToken-ToAccess-Resource',
      status: 'waiting',
      content: null,
      error: null
    }
  ]);

  const [expandedToken, setExpandedToken] = useState(null);

  useEffect(() => {
    fetchTokenData();
    const interval = setInterval(fetchTokenData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchTokenData = async () => {
    try {
      const response = await apiClient.get('/api/tokens/chain');
      updateTokenStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch token chain:', error);
    }
  };

  const updateTokenStatus = (tokenData) => {
    setTokens(prevTokens => 
      prevTokens.map(token => {
        const updatedToken = tokenData[token.id];
        if (updatedToken) {
          return {
            ...token,
            status: updatedToken.status || token.status,
            content: updatedToken.content || token.content,
            error: updatedToken.error || token.error
          };
        }
        return token;
      })
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'acquiring':
        return '#FF9800';
      case 'waiting':
        return '#2196F3';
      case 'error':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'acquiring':
        return 'Acquiring...';
      case 'waiting':
        return 'Waiting';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const formatTokenContent = (content) => {
    if (!content) return 'No content available';
    
    try {
      // If it's a JWT, try to parse it
      if (typeof content === 'string' && content.split('.').length === 3) {
        const parts = content.split('.');
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1]));
        
        return (
          <div className="token-content-jwt">
            <div className="jwt-section">
              <h5>Header</h5>
              <pre>{JSON.stringify(header, null, 2)}</pre>
            </div>
            <div className="jwt-section">
              <h5>Payload</h5>
              <pre>{JSON.stringify(payload, null, 2)}</pre>
            </div>
            <div className="jwt-section">
              <h5>Signature</h5>
              <p>[Signature hidden for security]</p>
            </div>
          </div>
        );
      }
    } catch (e) {
      // Not a valid JWT or parsing failed
    }

    // If it's already an object, format it
    if (typeof content === 'object') {
      return <pre>{JSON.stringify(content, null, 2)}</pre>;
    }

    // Otherwise, display as text
    return <pre>{content}</pre>;
  };

  const toggleTokenExpansion = (tokenId) => {
    setExpandedToken(expandedToken === tokenId ? null : tokenId);
  };

  return (
    <div className="token-chain-display">
      <div className="token-chain-header">
        <h3>Token Chain</h3>
        <p>Real-time visualization of token creation and exchange flow</p>
      </div>
      
      <div className="token-chain-flow">
        {tokens.map((token, index) => (
          <React.Fragment key={token.id}>
            <div 
              className={`token-card ${token.status} ${expandedToken === token.id ? 'expanded' : ''}`}
              onClick={() => toggleTokenExpansion(token.id)}
            >
              <div className="token-header">
                <div className="token-info">
                  <h4>{token.name}</h4>
                  <div className="token-status">
                    <div 
                      className="status-indicator"
                      style={{ backgroundColor: getStatusColor(token.status) }}
                    />
                    <span>{getStatusText(token.status)}</span>
                  </div>
                </div>
                <button className="expand-button">
                  {expandedToken === token.id ? '▼' : '▶'}
                </button>
              </div>
              
              {token.error && (
                <div className="token-error">
                  <span className="error-icon">⚠️</span>
                  <span>{token.error}</span>
                </div>
              )}
              
              {expandedToken === token.id && (
                <div className="token-content">
                  <div className="content-header">
                    <h5>Token Content</h5>
                  </div>
                  <div className="content-body">
                    {formatTokenContent(token.content)}
                  </div>
                </div>
              )}
            </div>
            
            {index < tokens.length - 1 && (
              <div className="token-connector">
                <div className="connector-line" />
                <div className="connector-arrow">→</div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      
      <div className="token-chain-legend">
        <h5>Status Legend</h5>
        <div className="legend-items">
          <div className="legend-item">
            <div className="status-indicator" style={{ backgroundColor: '#4CAF50' }} />
            <span>Active</span>
          </div>
          <div className="legend-item">
            <div className="status-indicator" style={{ backgroundColor: '#FF9800' }} />
            <span>Acquiring</span>
          </div>
          <div className="legend-item">
            <div className="status-indicator" style={{ backgroundColor: '#2196F3' }} />
            <span>Waiting</span>
          </div>
          <div className="legend-item">
            <div className="status-indicator" style={{ backgroundColor: '#F44336' }} />
            <span>Error</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenChainDisplay;
