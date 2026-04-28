'use strict';

/**
 * Agent identity — acquires the actor_token for RFC 8693 token exchange.
 *
 * Mode A (default): client_secret — Basic auth client credentials flow.
 * Mode B (PKI):     private_key_jwt — signs a JWT with the agent's private key
 *                   (enabled via USE_PKI_AGENT_CREDS=true + AGENT_CERT_PATH).
 *
 * Returns a short-lived client-credentials access_token representing agent1.
 * The BFF/agent passes this as `actor_token` in the RFC 8693 exchange so that
 * PingOne can embed `act: { sub: AGENT_CLIENT_ID }` in the delegated token.
 */

import { readFileSync } from 'node:fs';
import { createPrivateKey } from 'node:crypto';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { AgentConfig } from './config';

let _cachedActorToken: { token: string; expiresAt: number } | null = null;

export async function getActorToken(config: AgentConfig): Promise<string> {
  if (_cachedActorToken && _cachedActorToken.expiresAt > Date.now() + 10_000) {
    return _cachedActorToken.token;
  }

  if (config.usePkiCreds) {
    return _acquireViaPrivateKeyJwt(config);
  }
  return _acquireViaClientSecret(config);
}

async function _acquireViaClientSecret(config: AgentConfig): Promise<string> {
  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'ai_agent',
  });

  const response = await axios.post(config.tokenEndpoint, params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    timeout: 10_000,
  });

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('client_credentials response missing access_token');

  _cachedActorToken = { token: access_token, expiresAt: Date.now() + (expires_in || 300) * 1000 };
  return access_token;
}

async function _acquireViaPrivateKeyJwt(config: AgentConfig): Promise<string> {
  if (!config.agentCertPath) {
    throw new Error('USE_PKI_AGENT_CREDS=true but AGENT_CERT_PATH is not set');
  }

  // Load private key from PKCS#12 or PEM file
  const raw = readFileSync(config.agentCertPath);
  const privateKey = createPrivateKey(raw);

  // Build client_assertion JWT per RFC 7521 §4.2 / OIDC Core §9
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss: config.clientId,
      sub: config.clientId,
      aud: config.tokenEndpoint,
      jti: `${config.clientId}-${now}-${Math.random().toString(36).slice(2)}`,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: 'RS256' },
  );

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'ai_agent',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
    client_id: config.clientId,
  });

  const response = await axios.post(config.tokenEndpoint, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10_000,
  });

  const { access_token, expires_in } = response.data;
  if (!access_token) throw new Error('private_key_jwt client_credentials response missing access_token');

  _cachedActorToken = { token: access_token, expiresAt: Date.now() + (expires_in || 300) * 1000 };
  return access_token;
}

export function clearActorTokenCache(): void {
  _cachedActorToken = null;
}
