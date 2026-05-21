'use strict';
const axios = require('axios');
const configStore = require('./configStore');

/**
 * Fetches OIDC discovery metadata from the issuer's .well-known/openid-configuration.
 * Returns parsed metadata object, or null if discovery is unconfigured or fails.
 *
 * Security:
 * - HTTPS-only: rejects http:// discovery URLs in non-development environments
 * - Issuer validation: discovered issuer must match configured oauth_issuer
 * - 5-second timeout: slow/hung discovery never blocks startup
 */
async function fetchDiscoveryMetadata(discoveryUrl) {
  if (!discoveryUrl) {
    const issuer = configStore.getEffective('oauth_issuer');
    if (!issuer) return null;
    discoveryUrl = `${issuer.trim().replace(/\/$/, '')}/.well-known/openid-configuration`;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && discoveryUrl.startsWith('http://')) {
    console.error('[oauth-discovery] HTTPS required for discovery URL in production:', discoveryUrl);
    return null;
  }

  try {
    const response = await axios.get(discoveryUrl, { timeout: 5000 });
    const metadata = response.data;

    // Validate required fields
    const required = ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'];
    for (const field of required) {
      if (!metadata[field]) {
        console.error(`[oauth-discovery] Missing required field in metadata: ${field}`);
        return null;
      }
    }

    // Validate issuer matches configured value
    const configuredIssuer = configStore.getEffective('oauth_issuer');
    if (configuredIssuer) {
      const norm = (s) => s.trim().replace(/\/$/, '');
      if (norm(metadata.issuer) !== norm(configuredIssuer)) {
        console.error(
          `[oauth-discovery] Issuer mismatch — configured: ${norm(configuredIssuer)}, discovered: ${norm(metadata.issuer)}`
        );
        return null;
      }
    }

    return metadata;
  } catch (err) {
    console.warn('[oauth-discovery] Failed to fetch metadata:', err.message);
    return null;
  }
}

/**
 * Extracts normalized OAuth endpoints from OIDC discovery metadata.
 */
function extractEndpoints(metadata) {
  if (!metadata) return null;
  return {
    authorization_endpoint: metadata.authorization_endpoint || null,
    token_endpoint:         metadata.token_endpoint         || null,
    userinfo_endpoint:      metadata.userinfo_endpoint      || null,
    jwks_uri:               metadata.jwks_uri               || null,
    issuer:                 metadata.issuer                 || null,
  };
}

module.exports = {
  fetchDiscoveryMetadata,
  extractEndpoints,
};
