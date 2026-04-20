import React, { useState } from 'react';
import './MCPToolsListModal.css';

/**
 * MCPToolsListModal — Pop-out display of all available MCP banking tools
 *
 * Shows:
 *   - Tool name and description
 *   - Required input parameters
 *   - Scrollable list for long tool catalogs
 */
export default function MCPToolsListModal({ show, onClose, tools = [] }) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!show) return null;

  // Filter tools by search term
  const filteredTools = tools.filter(tool => {
    const searchLower = searchTerm.toLowerCase();
    return (
      tool.name?.toLowerCase().includes(searchLower) ||
      tool.description?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="mcp-tools-modal-overlay" onClick={onClose}>
      <div className="mcp-tools-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="mcp-tools-modal-header">
          <h2>🔧 Available MCP Tools ({tools.length})</h2>
          <button className="mcp-tools-close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="mcp-tools-search-bar">
          <input
            type="text"
            placeholder="Search tools..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="mcp-tools-search-input"
            autoFocus
          />
        </div>

        <div className="mcp-tools-list">
          {filteredTools.length === 0 ? (
            <div className="mcp-tools-empty">
              <p>{searchTerm ? 'No tools match your search' : 'No tools found'}</p>
            </div>
          ) : (
            filteredTools.map((tool, idx) => (
              <div key={`${tool.name}-${idx}`} className="mcp-tool-item">
                <div className="mcp-tool-name">
                  <span className="mcp-tool-icon">🛠️</span>
                  {tool.name}
                </div>
                <p className="mcp-tool-description">{tool.description || '(no description)'}</p>
                {tool.inputSchema?.properties && Object.keys(tool.inputSchema.properties).length > 0 && (
                  <div className="mcp-tool-inputs">
                    <strong>Inputs:</strong>
                    <div className="mcp-tool-input-list">
                      {Object.keys(tool.inputSchema.properties).map((inputName) => (
                        <span key={inputName} className="mcp-tool-input-badge">{inputName}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="mcp-tools-footer">
          <button className="mcp-tools-close-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
