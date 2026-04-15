/**
 * Cached status endpoint service
 * Deduplicates and caches common status endpoint calls to reduce excessive polling.
 * Each status endpoint has a 3-second TTL — requests within that window reuse cached results.
 */

const cache = {};
const CACHE_TTL_MS = 3000; // 3 seconds

/**
 * Get cached status with request deduplication.
 * If a request is already in flight, returns the same promise.
 * If a cached response exists and hasn't expired, returns cached promise.
 * Otherwise, makes a fresh request.
 */
export async function getCachedStatus(url, config = {}) {
  const now = Date.now();
  const cacheKey = url;
  const cached = cache[cacheKey];

  // Return cached promise if still valid
  if (cached && cached.expires > now) {
    return cached.promise;
  }

  // Make request and cache it
  const promise = fetch(url, {
    credentials: 'include',
    ...(config._silent && { _silent: true }),
  })
    .then((r) => {
      if (!r.ok) throw new Error(`${url} returned ${r.status}`);
      return r.json();
    })
    .then((data) => {
      // Cache the successful response
      cache[cacheKey] = { promise: Promise.resolve(data), expires: now + CACHE_TTL_MS };
      return data;
    })
    .catch((err) => {
      // Don't cache errors; allow retry on next call
      delete cache[cacheKey];
      throw err;
    });

  // Store the promise immediately so subsequent calls get the same one
  cache[cacheKey] = { promise, expires: now + CACHE_TTL_MS };
  return promise;
}

/**
 * Clear all cached status responses.
 * Useful for explicit refresh or when user logs out.
 */
export function clearStatusCache() {
  Object.keys(cache).forEach((key) => {
    delete cache[key];
  });
}

/**
 * Clear a specific status endpoint from cache.
 */
export function clearStatusCacheFor(url) {
  delete cache[url];
}
