'use strict';

import jwt from 'jsonwebtoken';

export interface DecodedToken {
  sub: string;
  act?: { sub: string };
  scope?: string;
  aud: string | string[];
  exp: number;
}

export class TokenError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'TokenError';
  }
}

export function decodeAndValidate(token: string, expectedAud: string): DecodedToken {
  let decoded: DecodedToken;
  try {
    decoded = jwt.decode(token) as DecodedToken;
  } catch {
    throw new TokenError('Malformed JWT', 'invalid_token');
  }
  if (!decoded) throw new TokenError('Empty JWT', 'invalid_token');

  if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
    throw new TokenError('Token expired', 'expired_token');
  }

  const audList = Array.isArray(decoded.aud) ? decoded.aud : [decoded.aud];
  if (!audList.includes(expectedAud)) {
    throw new TokenError(
      `Audience mismatch: got [${audList.join(', ')}], expected ${expectedAud}`,
      'invalid_aud',
    );
  }

  return decoded;
}

export function extractScopes(decoded: DecodedToken): string[] {
  return (decoded.scope || '').split(' ').filter(Boolean);
}
