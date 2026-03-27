/**
 * configService.js — IndexedDB caching layer for non-secret config values.
 *
 * Secrets are NEVER stored here.  Only PUBLIC_FIELDS are persisted to
 * IndexedDB so that the Config form can be pre-filled on the next page load
 * without waiting for the server round-trip.
 *
 * The server remains the source of truth; this is purely a convenience cache.
 */

const DB_NAME    = 'banking-assistant-config';
const STORE_NAME = 'config';
const DB_VERSION = 1;

/** Fields safe to cache in IndexedDB (no secrets). */
export const PUBLIC_FIELDS = [
  'pingone_environment_id',
  'pingone_region',
  'admin_client_id',
  'admin_redirect_uri',
  'user_client_id',
  'user_redirect_uri',
  'admin_role',
  'user_role',
  'debug_oauth',
  'frontend_url',
  'mcp_server_url',
  'ui_industry_preset',
  'agent_mcp_allowed_scopes',
];

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

/** Persist public fields from a config object to IndexedDB. */
export async function savePublicConfig(data) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      for (const field of PUBLIC_FIELDS) {
        if (data[field] !== undefined && data[field] !== null) {
          store.put({ key: field, value: data[field] });
        }
      }
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (_) {
    // IndexedDB unavailable (private browsing, etc.) — silently ignore
  }
}

/** Load all cached public config values from IndexedDB. */
export async function loadPublicConfig() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx     = db.transaction(STORE_NAME, 'readonly');
      const store  = tx.objectStore(STORE_NAME);
      const result = {};
      const req    = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          result[cursor.value.key] = cursor.value.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch (_) {
    return {};
  }
}

/** Wipe the IndexedDB cache (e.g. on reset). */
export async function clearConfig() {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch (_) {
    // ignore
  }
}
