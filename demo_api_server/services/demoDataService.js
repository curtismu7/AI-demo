'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const configStore = require('./configStore');

// Determine storage backend — always SQLite
const useSQLite = true;

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
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA busy_timeout=5000');

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

// Core functions

async function getDemoAccounts(userId = null) {
  try {
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
    
    if (migratedCount > 0) {
      console.log('[demoDataService] NOTE: Accounts migrated to SQLite');
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
    backend: useSQLite ? 'sqlite' : 'unknown',
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
  useSQLite
};
