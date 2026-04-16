// banking_api_ui/src/services/sessionResolver.js
import { getCachedJson } from './cachedStatusService';

/**
 * Resolve current authenticated user from all supported session endpoints.
 * Order matches App/session behavior: admin OAuth -> user OAuth -> generic session.
 *
 * Cached with 3s TTL + in-flight dedup via cachedStatusService.
 * Cache cleared on login/logout events. BFF cookie auth means cached status is safe.
 */
export async function resolveSessionUser() {
  const [admin, endUser, session] = await Promise.allSettled([
    getCachedJson('/api/auth/oauth/status'),
    getCachedJson('/api/auth/oauth/user/status'),
    getCachedJson('/api/auth/session'),
  ]);

  const adminUser = admin.status === 'fulfilled' && admin.value?.data?.authenticated ? admin.value.data.user : null;
  if (adminUser) return adminUser;

  const endUserUser = endUser.status === 'fulfilled' && endUser.value?.data?.authenticated ? endUser.value.data.user : null;
  if (endUserUser) return endUserUser;

  const sessionUser = session.status === 'fulfilled' && session.value?.data?.authenticated ? session.value.data.user : null;
  return sessionUser || null;
}
