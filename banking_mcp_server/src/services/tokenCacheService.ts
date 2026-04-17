/**
 * Token Cache Service — In-memory TTL-aware cache for exchanged delegation tokens.
 * Implements D-01: Lazy + cache — exchange on first call, cache with TTL, re-exchange on expiry.
 */

interface CacheEntry {
  token: string;
  expiresAt: number;
}

export class TokenCacheService {
  private cache: Map<string, CacheEntry> = new Map();

  /** Buffer in ms subtracted from expiry to avoid using nearly-expired tokens */
  private readonly expiryBufferMs: number;

  constructor(expiryBufferMs: number = 30_000) {
    this.expiryBufferMs = expiryBufferMs;
  }

  private buildKey(userId: string, scopes: string[]): string {
    const sorted = [...scopes].sort();
    return `${userId}:${JSON.stringify(sorted)}`;
  }

  /**
   * Get a cached token for the given user and scope set.
   * Returns null if no entry exists or the token has expired.
   */
  get(userId: string, scopes: string[]): string | null {
    const key = this.buildKey(userId, scopes);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() >= entry.expiresAt - this.expiryBufferMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.token;
  }

  /**
   * Store a token with its absolute expiry timestamp (ms since epoch).
   */
  set(userId: string, scopes: string[], token: string, expiresAt: number): void {
    const key = this.buildKey(userId, scopes);
    this.cache.set(key, { token, expiresAt });
  }

  /**
   * Clear cached tokens. If userId is provided, clear only that user's entries.
   * Otherwise clear the entire cache.
   */
  clear(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }

    const prefix = `${userId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /** Number of entries currently in the cache (useful for diagnostics). */
  get size(): number {
    return this.cache.size;
  }
}

export const tokenCache = new TokenCacheService();
