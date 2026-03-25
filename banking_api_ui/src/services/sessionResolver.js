// banking_api_ui/src/services/sessionResolver.js
import bffAxios from './bffAxios';

/**
 * Resolve current authenticated user from all supported session endpoints.
 * Order matches App/session behavior: admin OAuth -> user OAuth -> generic session.
 */
export async function resolveSessionUser() {
  const [admin, endUser, session] = await Promise.allSettled([
    bffAxios.get('/api/auth/oauth/status'),
    bffAxios.get('/api/auth/oauth/user/status'),
    bffAxios.get('/api/auth/session'),
  ]);

  const adminUser = admin.status === 'fulfilled' && admin.value?.data?.authenticated ? admin.value.data.user : null;
  if (adminUser) return adminUser;

  const endUserUser = endUser.status === 'fulfilled' && endUser.value?.data?.authenticated ? endUser.value.data.user : null;
  if (endUserUser) return endUserUser;

  const sessionUser = session.status === 'fulfilled' && session.value?.data?.authenticated ? session.value.data.user : null;
  return sessionUser || null;
}

