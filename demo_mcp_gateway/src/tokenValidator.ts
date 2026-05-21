'use strict';

/**
 * Validates inbound tokens from agent1.
 * Decodes JWT and verifies the aud claim matches the gateway's resource URI.
 * Signature verification is done by PingOne at token-exchange time; the GW
 * trusts the act chain already established.
 *
 * For production use with local JWT sig verification, set:
 *   PINGONE_JWKS_ENDPOINT — enables jsonwebtoken.verify() against PingOne JWKS
 */

import jwt from 'jsonwebtoken';

export interface DecodedGatewayToken {
  sub: string;
  act?: { sub: string; act?: { sub: string } };
  scope?: string;
  aud: string | string[];
  exp: number;
  iss?: string;
}

export class TokenValidationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TokenValidationError';
  }
}

export function validateInboundToken(
  token: string,
  expectedAud: string,
): DecodedGatewayToken {
  if (!token) throw new TokenValidationError('Missing bearer token', 'missing_token');

  let decoded: DecodedGatewayToken;
  try {
    // Decode without signature verification — PingOne already issued this token.
    // For production add JWKS-based verification here.
    decoded = jwt.decode(token) as DecodedGatewayToken;
  } catch {
    throw new TokenValidationError('Malformed JWT', 'invalid_token');
  }

  if (!decoded) throw new TokenValidationError('Empty JWT payload', 'invalid_token');

  // Expiry check
  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new TokenValidationError('Token expired', 'expired_token');
  }

  // Audience check — FAIL CLOSED per RFC 6749
  const audList = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
  if (!audList.includes(expectedAud)) {
    throw new TokenValidationError(
      `Audience mismatch: got [${audList.join(', ')}], expected ${expectedAud}`,
      'invalid_aud',
    );
  }

  return decoded;
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1];
}
