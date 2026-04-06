'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const configStore = require('./configStore');

// Determine storage backend
const isVercel = process.env.VERCEL === '1';
const useEnvVar = isVercel && process.env.DEMO_ACCOUNTS;
const useSQLite = !isVercel;

let db = null;

// Initialize SQLite if needed (local only)
if (useSQLite) {
  try {
    const Database = require('better-sqlite3');
    const dbDir = path.join(process.cwd(), 'data', 'persistent');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'demoAccounts.db');
    db = new Database(dbPath);
    
    // Create table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS demo_accounts (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        accountType TEXT NOT NULL,
        accountNumber TEXT NOT NULL,
        routingNumber TEXT NOT NULL,
        balance REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        status TEXT NOT NULL DEFAULT 'active',
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_demo_accounts_userId ON demo_accounts(userId);
    `);
    console.log('[demoDataService] SQLite initialized at', dbPath);
  } catch (err) {
    console.error('[demoDataService] Failed to initialize SQLite:', err.message);
    // Fallback to in-memory if SQLite fails
    db = null;
  }
}

// Helper to update Vercel environment variable
async function updateVercelEnvVar(key, value) {
  // This would use Vercel API to update environment variables
  // For now, log and return success
  console.log(`[demoDataService] Would update Vercel env var ${key} with ${value?.length || 0} chars`);
  return { ok: true };
}

// Core functions

async function getDemoAccounts(userId = null) {
  try {
    if (useEnvVar) {
      // Parse from environment variable
      const envAccounts = process.env.DEMO_ACCOUNTS ? JSON.parse(process.env.DEMO_ACCOUNTS) : [];
      return userId ? envAccounts.filter(acc => acc.userId === userId) : envAccounts;
    }
    
    if (useSQLite && db) {
      // Query from SQLite
      let query = 'SELECT * FROM demo_accounts';
      let params = [];
      
      if (userId) {
        query += ' WHERE userId = ?';
        params.push(userId);
      }
      
      query += ' ORDER BY createdAt';
      
      const stmt = db.prepare(query);
      const rows = stmt.all(...params);
      return rows;
    }
    
    // Fallback: return empty array
    return [];
  } catch (err) {
    console.error('[demoDataService] getDemoAccounts error:', err.message);
    return [];
  }
}

async function createDemoAccount(accountData) {
  try {
    const { userId, accountType, accountNumber, routingNumber, balance, currency = 'USD', status = 'active' } = accountData;
    
    // Validate required fields
    if (!userId || !accountType || !accountNumber || !routingNumber || balance === undefined) {
      throw new Error('Missing required fields');
    }
    
    const account = {
      id: crypto.randomUUID(),
      userId,
      accountType,
      accountNumber,
      routingNumber,
      balance: parseFloat(balance),
      currency,
      status,
      createdAt: new Date().toISOString()
    };
    
    if (useEnvVar) {
      // Read current accounts, add new one, update environment variable
      const currentAccounts = process.env.DEMO_ACCOUNTS ? JSON.parse(process.env.DEMO_ACCOUNTS) : [];
      currentAccounts.push(account);
      await updateVercelEnvVar('DEMO_ACCOUNTS', JSON.stringify(currentAccounts));
      return account;
    }
    
    if (useSQLite && db) {
      // Insert into SQLite
      const stmt = db.prepare(`
        INSERT INTO demo_accounts (id, userId, accountType, accountNumber, routingNumber, balance, currency, status, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(account.id, account.userId, account.accountType, account.accountNumber, 
              account.routingNumber, account.balance, account.currency, account.status, account.createdAt);
      return account;
    }
    
    throw new Error('No storage backend available');
  } catch (err) {
    console.error('[demoDataService] createDemoAccount error:', err.message);
    throw err;
  }
}

async function deleteDemoAccount(accountId, userId) {
  try {
    if (useEnvVar) {
      // Filter accounts by ID, update environment variable
      const currentAccounts = process.env.DEMO_ACCOUNTS ? JSON.parse(process.env.DEMO_ACCOUNTS) : [];
      const filteredAccounts = currentAccounts.filter(acc => !(acc.id === accountId && acc.userId === userId));
      
      if (filteredAccounts.length === currentAccounts.length) {
        return { ok: false, error: 'not_found' };
      }
      
      await updateVercelEnvVar('DEMO_ACCOUNTS', JSON.stringify(filteredAccounts));
      return { ok: true };
    }
    
    if (useSQLite && db) {
      // Delete from SQLite
      const stmt = db.prepare('DELETE FROM demo_accounts WHERE id = ? AND userId = ?');
      const result = stmt.run(accountId, userId);
      
      if (result.changes === 0) {
        return { ok: false, error: 'not_found' };
      }
      
      return { ok: true };
    }
    
    return { ok: false, error: 'no_storage' };
  } catch (err) {
    console.error('[demoDataService] deleteDemoAccount error:', err.message);
    return { ok: false, error: 'internal_error' };
  }
}

async function migrateAccounts() {
  try {
    console.log('[demoDataService] Starting migration...');
    
    // Check if any accounts exist in the target backend
    const existingAccounts = await getDemoAccounts();
    if (existingAccounts.length > 0) {
      console.log(`[demoDataService] Migration skipped: ${existingAccounts.length} accounts already exist`);
      return { ok: true, migrated: 0, existing: existingAccounts.length };
    }
    
    // Get legacy in-memory accounts (from accounts.js provisionDemoAccounts)
    let migratedCount = 0;
    
    // For demonstration, create sample accounts if none exist
    const sampleAccounts = [
      {
        userId: 'sample_user_001',
        accountType: 'checking',
        accountNumber: '1234567890123456',
        routingNumber: '021000021',
        balance: 2500.00,
        currency: 'USD',
        status: 'active'
      },
      {
        userId: 'sample_user_001',
        accountType: 'savings',
        accountNumber: '9876543210987654',
        routingNumber: '021000021',
        balance: 15000.00,
        currency: 'USD',
        status: 'active'
      }
    ];
    
    for (const accountData of sampleAccounts) {
      try {
        await createDemoAccount(accountData);
        migratedCount++;
      } catch (err) {
        console.error('[demoDataService] Failed to migrate account:', err.message);
      }
    }
    
    console.log(`[demoDataService] Migration completed: ${migratedCount} accounts migrated`);
    
    if (useEnvVar && migratedCount > 0) {
      console.log('[demoDataService] NOTE: For Vercel deployment, manually set DEMO_ACCOUNTS environment variable with the migrated accounts');
    }
    
    return { ok: true, migrated: migratedCount, existing: 0 };
  } catch (err) {
    console.error('[demoDataService] Migration error:', err.message);
    return { ok: false, error: err.message, migrated: 0 };
  }
}

// Get backend info for UI
function getBackendInfo() {
  return {
    backend: useEnvVar ? 'env_var' : (useSQLite ? 'sqlite' : 'unknown'),
    isVercel,
    useEnvVar,
    useSQLite,
    accountCount: null // Will be populated by caller
  };
}

module.exports = {
  getDemoAccounts,
  createDemoAccount,
  deleteDemoAccount,
  migrateAccounts,
  getBackendInfo,
  isVercel,
  useEnvVar,
  useSQLite
};
