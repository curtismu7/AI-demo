// banking_api_ui/src/services/sessionResolver.js
import { getCachedStatus } from './cachedStatusService';

/**
 * Resolve current authenticated user from all supported session endpoints.
 * Order matches App/session behavior: admin OAuth -> user OAuth -> generic session.
 * Uses request deduplication cache to prevent cascading API calls.
 */
export async function resolveSessionUser() {
  const [admin, endUser, session] = await Promise.allSettled([
    getCachedStatus('/api/auth/oauth/status', { _silent: true }),
    getCachedStatus('/api/auth/oauth/user/status', { _silent: true }),
    getCachedStatus('/api/auth/session', { _silent: true }),
  ]);

  const adminUser = admin.status === 'fulfilled' && admin.value?.authenticated ? admin.value.user : null;
  if (adminUser) return adminUser;

  const endUserUser = endUser.status === 'fulfilled' && endUser.value?.authenticated ? endUser.value.user : null;
  if (endUserUser) return endUserUser;

  const sessionUser = session.status === 'fulfilled' && session.value?.authenticated ? session.value.user : null;
  return sessionUser || null;
}

