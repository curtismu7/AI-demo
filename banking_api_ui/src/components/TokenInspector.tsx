import React, { useState } from 'react';
import './TokenInspector.css';

/**
 * TokenInspector Component
 * 
 * Displays JWT token claims with clear labels emphasizing actor/agent terminology.
 * Shows decoded JWT structure, highlights actor-related claims (act, may_act),
 * and provides tooltips explaining each claim's purpose per ACTOR_TOKEN_TERMINOLOGY.md.
 * 
 * Props:
 *   @param {Object} decodedToken - Decoded JWT object with claims
 *   @param {string} [title] - Optional title (default: "Token Inspector")
 *   @param {string} [className] - Additional CSS classes
 */
function TokenInspector({ decodedToken, title = 'Token Inspector', className = '' }) {
  const [expandedClaim, setExpandedClaim] = useState<string | null>(null);

  if (!decodedToken || typeof decodedToken !== 'object') {
    return (
      <div className={`token-inspector ${className}`}>
        <p className="ti-no-token">No token to inspect</p>
      </div>
    );
  }

  /**
   * Tooltip content for each claim, explaining its purpose per ACTOR_TOKEN_TERMINOLOGY.md
   */
  const claimTooltips = {
    'act': 'Actor Identity (Act Claim) — RFC 8693 §4.2. Identifies the agent (actor) performing actions on behalf of a user. Contains the agent\'s ID (sub) and the original user being acted upon.',
    'may_act': 'Actor Permissions (May_Act Claim) — RFC 8693 §4.3. Defines what this agent (actor) is allowed to do on behalf of the user. Grants specific scopes/abilities to the delegated token.',
    'sub': 'Subject (User ID) — The authenticated user. When token has an "act" claim, this is the original user the agent (actor) is acting on behalf of.',
    'aud': 'Audience (Aud Claim) — The API/service this token is intended for. An agent\'s delegated token must have the correct audience (aud claim) for the API it\'s accessing.',
    'iss': 'Issuer — The OAuth provider that issued this token (e.g., PingOne).',
    'exp': 'Expires — Unix timestamp when this token expires. After this time, the token is no longer valid.',
    'iat': 'Issued At — Unix timestamp when this token was issued.',
    'nbf': 'Not Before — Unix timestamp before which this token is not valid.',
    'scope': 'Scopes — Permissions granted to this token. Defines what APIs/resources this token can access.',
    'jti': 'JWT ID — Unique identifier for this token instance (used for revocation/blacklisting).',
    'client_id': 'Client ID — The OAuth client (app) that requested or is using this token.',
    'auth_time': 'Authentication Time — Unix timestamp when the user was last authenticated.',
    'name': 'Name — Display name of the authenticated user (if provided by OAuth provider).',
    'email': 'Email — Email address of the authenticated user (if provided by OAuth provider).',
  };

  /**
   * Determine if a claim is actor-related (act or may_act)
   */
  const isActorClaim = (key: string): boolean => {
    return key === 'act' || key === 'may_act';
  };

  /**
   * Get human-readable label for a claim
   */
  const getClaimLabel = (key: string): string => {
    const labels: Record<string, string> = {
      'act': 'Actor Identity (Act Claim)',
      'may_act': 'Actor Permissions (May_Act Claim)',
      'sub': 'Subject (User ID)',
      'aud': 'Audience (API)',
      'iss': 'Issuer',
      'exp': 'Expires',
      'iat': 'Issued At',
      'nbf': 'Not Before',
      'scope': 'Scopes',
      'jti': 'JWT ID',
      'client_id': 'Client ID',
      'auth_time': 'Authentication Time',
      'name': 'Name',
      'email': 'Email',
    };
    return labels[key] || key;
  };

  /**
   * Format claim value for display (handles objects, timestamps, etc.)
   */
  const formatClaimValue = (key: string, value: any): string => {
    if (value === null || value === undefined) {
      return '(empty)';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    if ((key === 'exp' || key === 'iat' || key === 'nbf' || key === 'auth_time') && typeof value === 'number') {
      const date = new Date(value * 1000);
      return `${value} (${date.toLocaleString()})`;
    }
    return String(value);
  };

  /**
   * Get CSS class for styling a claim row
   */
  const getClaimClassName = (key: string): string => {
    let classes = 'ti-claim-row';
    if (isActorClaim(key)) classes += ' ti-claim-row--actor';
    if (key === 'act') classes += ' ti-claim-row--act';
    if (key === 'may_act') classes += ' ti-claim-row--may-act';
    if (key === 'aud') classes += ' ti-claim-row--aud';
    if (key === 'scope') classes += ' ti-claim-row--scope';
    return classes;
  };

  /**
   * Get icon for a claim (for visual distinction)
   */
  const getClaimIcon = (key: string): string => {
    if (key === 'act') return '🎭'; // Actor/agent delegation
    if (key === 'may_act') return '🔐'; // Permissions
    if (key === 'sub') return '👤'; // User
    if (key === 'aud') return '🎯'; // Target API
    if (key === 'scope') return '📋'; // Scopes/permissions
    if (key === 'exp') return '⏰'; // Expiration
    return '🏷️'; // Generic claim
  };

  const sortedKeys = Object.keys(decodedToken).sort((a, b) => {
    // Prioritize important claims
    const priority: Record<string, number> = {
      'sub': 1, 'act': 2, 'may_act': 3, 'aud': 4, 'scope': 5,
      'iss': 6, 'client_id': 7, 'iat': 8, 'exp': 9,
    };
    return (priority[a] || 999) - (priority[b] || 999);
  });

  const hasActorClaims = decodedToken.act || decodedToken.may_act;

  return (
    <div className={`token-inspector ${className}`} data-testid="token-inspector">
      <div className="ti-header">
        <h3 className="ti-title">{title}</h3>
        {hasActorClaims && (
          <span className="ti-badge ti-badge--actor" title="This token contains actor/delegation claims">
            🎭 Actor Token
          </span>
        )}
      </div>

      {hasActorClaims && (
        <div className="ti-actor-notice">
          <strong>⚠️ Actor Token Detected:</strong> This token includes actor (agent) delegation claims.
          The agent (actor) identified in the <code>act</code> claim is acting on behalf of the user
          identified in the <code>sub</code> claim. See <code>may_act</code> for the agent's permissions.
        </div>
      )}

      <div className="ti-claims-container">
        {sortedKeys.map((key) => {
          const value = decodedToken[key];
          const label = getClaimLabel(key);
          const tooltip = claimTooltips[key as keyof typeof claimTooltips] || '';
          const isExpanded = expandedClaim === key;
          const isActor = isActorClaim(key);

          return (
            <div
              key={key}
              className={getClaimClassName(key)}
              data-claim={key}
              data-actor={isActor}
            >
              <div className="ti-claim-header">
                <span className="ti-claim-icon">{getClaimIcon(key)}</span>
                <button
                  className={`ti-claim-label ${isExpanded ? 'expanded' : ''}`}
                  onClick={() => setExpandedClaim(isExpanded ? null : key)}
                  aria-expanded={isExpanded}
                  title={tooltip}
                >
                  {label}
                </button>
                {tooltip && (
                  <span className="ti-tooltip-icon" title={tooltip}>
                    ⓘ
                  </span>
                )}
              </div>

              {isExpanded && (
                <div className="ti-claim-content">
                  {tooltip && (
                    <div className="ti-claim-explanation">
                      {tooltip}
                    </div>
                  )}
                  <pre className="ti-claim-value">
                    {formatClaimValue(key, value)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ti-footer">
        <p className="ti-reference">
          See <a href="#" title="Learn about actor/agent token terminology">ACTOR_TOKEN_TERMINOLOGY.md</a> for detailed definitions.
        </p>
      </div>
    </div>
  );
}

export default TokenInspector;
