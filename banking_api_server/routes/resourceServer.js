const express = require('express');
const router = express.Router();
const dataStore = require('../data/store');
const configStore = require('../services/configStore');
const { decodeJwtClaims, sanitizeClaims } = require('../services/agentMcpTokenService');

/**
 * GET /api/resource-server/summary
 * Returns banking summary + decoded token claims for display on the OIDC Resource Server page.
 * Raw tokens NEVER leave the server — only decoded/sanitized claims are sent.
 */
router.get('/summary', (req, res) => {
  // Require authenticated session
  if (!req.session || !req.session.oauthTokens || !req.session.oauthTokens.accessToken || req.session.oauthTokens.accessToken === '_cookie_session') {
    return res.status(401).json({ error: 'authentication_required', message: 'Please log in to access the OIDC Resource Server.' });
  }

  try {
    const accessToken = req.session.oauthTokens.accessToken;
    const idToken = req.session.oauthTokens.idToken;

    // Decode tokens (no signature verification — display only)
    const accessDecoded = decodeJwtClaims(accessToken);
    const idDecoded = decodeJwtClaims(idToken);

    const accessClaims = sanitizeClaims(accessDecoded?.claims) || {};
    const idClaims = sanitizeClaims(idDecoded?.claims) || {};

    // Get user accounts
    const userId = req.session.user?.id || req.session.user?.sub;
    const accounts = userId ? dataStore.getAccountsByUserId(userId) : [];
    const formattedAccounts = accounts.map(a => ({
      id: a.id,
      accountType: a.accountType,
      name: a.name,
      balance: a.balance,
      currency: a.currency || 'USD',
      status: a.status || 'active',
      accountNumber: a.accountNumber || ('****' + (a.accountNumberFull || '').slice(-4)),
    }));

    // Get recent transactions
    const transactions = userId ? dataStore.getTransactionsByUserId(userId).slice(0, 5) : [];
    const formattedTransactions = transactions.map(t => ({
      id: t.id,
      type: t.type,
      amount: t.amount,
      description: t.description || t.type,
      createdAt: t.createdAt,
    }));

    // Build token metadata
    const rawClaims = accessDecoded?.claims || {};
    const resourceUri = configStore.getEffective('pingone_resource_mcp_server_uri') || '';

    const tokenMetadata = {
      audience: rawClaims.aud || null,
      scopes: typeof rawClaims.scope === 'string' ? rawClaims.scope.split(' ').filter(Boolean) : (Array.isArray(rawClaims.scope) ? rawClaims.scope : []),
      expiresAt: rawClaims.exp ? new Date(rawClaims.exp * 1000).toISOString() : null,
      issuedAt: rawClaims.iat ? new Date(rawClaims.iat * 1000).toISOString() : null,
      issuer: rawClaims.iss || null,
      actorClaim: rawClaims.act || null,
      mayActClaim: rawClaims.may_act || null,
    };

    const resourceServerInfo = {
      name: 'Banking API Resource Server',
      type: 'OIDC',
      description: 'User-delegated access via OIDC Authorization Code + PKCE',
      authMethod: 'Bearer token (access_token from PingOne)',
      targetAudience: resourceUri,
    };

    res.json({
      accounts: formattedAccounts,
      transactions: formattedTransactions,
      accessTokenClaims: accessClaims,
      idTokenClaims: idClaims,
      tokenMetadata,
      resourceServerInfo,
    });
  } catch (error) {
    console.error('[resource-server] summary error:', error);
    res.status(500).json({ error: 'internal_error', message: 'Failed to build resource server summary.' });
  }
});

module.exports = router;
