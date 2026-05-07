const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  try {
    Database = require('sqlite'); // Fallback to built-in sqlite
  } catch (e2) {
    console.warn('[DataStore] SQLite not available, transaction persistence disabled');
  }
}
const { sampleUsers, sampleAccounts, sampleTransactions, sampleActivityLogs, sampleSubscriptions } = require('./sampleData');

const DEFAULT_BOOTSTRAP_PATH = path.join(__dirname, 'bootstrapData.json');
const RUNTIME_DATA_PATH = path.join(__dirname, 'runtimeData.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const BANKING_DB_PATH = path.join(__dirname, 'persistent', 'banking.db');
const MAX_BACKUPS = 3;
const MAX_ACTIVITY_LOGS = 1000;
const BACKUP_INTERVAL_MS = 15 * 60 * 1000;

class DataStore {
  constructor() {
    this.users = new Map();
    this.accounts = new Map();
    this.transactions = new Map();
    this.activityLogs = new Map();
    this.subscriptions = new Map();
    this._persistPending = false;
    this.initializeData();
    this._initializeSQLiteTransactions();
    this._startAutoBackup();
  }

  _initializeSQLiteTransactions() {
    if (!Database) {
      console.warn('[DataStore] SQLite not available, skipping transaction persistence');
      return;
    }

    try {
      const dbDir = path.dirname(BANKING_DB_PATH);
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

      const db = new Database(BANKING_DB_PATH);

      // Create transactions table if not exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          userId TEXT NOT NULL,
          fromAccountId TEXT,
          toAccountId TEXT,
          amount REAL NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          merchant TEXT,
          category TEXT,
          status TEXT,
          createdAt TEXT,
          updatedAt TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_transactions_userId ON transactions(userId);
        CREATE INDEX IF NOT EXISTS idx_transactions_createdAt ON transactions(createdAt);
      `);

      // Check if transactions table is empty, seed if needed
      const countStmt = db.prepare('SELECT COUNT(*) as cnt FROM transactions');
      const count = countStmt.get().cnt;
      if (count === 0) {
        console.log('[DataStore] Seeding transactions table with sample data...');
        const stmt = db.prepare(`
          INSERT INTO transactions (id, userId, fromAccountId, toAccountId, amount, type, description, merchant, category, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const txn of sampleTransactions) {
          stmt.run(
            txn.id,
            txn.userId,
            txn.fromAccountId || null,
            txn.toAccountId || null,
            txn.amount,
            txn.type,
            txn.description || null,
            txn.merchant || null,
            txn.category || null,
            txn.status,
            txn.createdAt?.toISOString() || null,
            new Date().toISOString()
          );
        }
        console.log(`[DataStore] Seeded ${sampleTransactions.length} transactions to SQLite`);
      }

      db.close();
    } catch (err) {
      console.warn('[DataStore] SQLite transaction initialization failed:', err.message);
    }
  }

  initializeData() {
    try {
      const snapshot = this.loadBootstrapSnapshot();
      this.hydrateFromSnapshot(snapshot);
    } catch (error) {
      console.error('Error initializing data store:', error);
      this.initializeSampleData();
    }
  }

  _isValidSnapshot(parsed) {
    return parsed && Array.isArray(parsed.users) && parsed.users.length > 0;
  }

  _tryReadJson(filePath) {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size === 0) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  loadBootstrapSnapshot() {
    const runtime = this._tryReadJson(RUNTIME_DATA_PATH);
    if (this._isValidSnapshot(runtime)) {
      console.log('[DataStore] Loaded data from runtimeData.json (' + runtime.users.length + ' users, ' + (runtime.accounts || []).length + ' accounts)');
      return this.normalizeBootstrap(runtime);
    }
    if (runtime !== null) {
      console.warn('[DataStore] runtimeData.json exists but is empty or corrupt — trying backups');
    }
    const restored = this._tryRestoreFromBackup();
    if (restored) return this.normalizeBootstrap(restored);

    const customBootstrap = process.env.BANKING_BOOTSTRAP_FILE;
    if (customBootstrap) {
      const custom = this._tryReadJson(customBootstrap);
      if (this._isValidSnapshot(custom)) {
        console.log('[DataStore] Loaded data from ' + path.basename(customBootstrap));
        return this.normalizeBootstrap(custom);
      }
    }
    const bootstrap = this._tryReadJson(DEFAULT_BOOTSTRAP_PATH);
    if (this._isValidSnapshot(bootstrap)) {
      console.log('[DataStore] Loaded data from bootstrapData.json (seed data)');
      return this.normalizeBootstrap(bootstrap);
    }
    console.log('[DataStore] No persisted data found, using built-in sample data');
    return this.normalizeBootstrap({
      users: sampleUsers,
      accounts: sampleAccounts,
      transactions: sampleTransactions,
      activityLogs: sampleActivityLogs,
    });
  }

  _tryRestoreFromBackup() {
    try {
      if (!fs.existsSync(BACKUP_DIR)) return null;
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('runtimeData-') && f.endsWith('.json'))
        .sort().reverse();
      for (const file of files) {
        const filePath = path.join(BACKUP_DIR, file);
        const parsed = this._tryReadJson(filePath);
        if (this._isValidSnapshot(parsed)) {
          console.log('[DataStore] Restored from backup: ' + file + ' (' + parsed.users.length + ' users, ' + (parsed.accounts || []).length + ' accounts)');
          try {
            this._atomicWrite(RUNTIME_DATA_PATH, JSON.stringify(parsed, null, 2));
            console.log('[DataStore] Restored runtimeData.json from backup');
          } catch (writeErr) {
            console.warn('[DataStore] Could not restore runtimeData.json:', writeErr.message);
          }
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[DataStore] Backup scan failed:', err.message);
    }
    return null;
  }

  normalizeBootstrap(snapshot) {
    const users = Array.isArray(snapshot.users) ? snapshot.users.map((user) => {
      const normalized = { ...user };
      if (normalized.password && !String(normalized.password).startsWith('$2')) {
        normalized.password = bcrypt.hashSync(String(normalized.password), 10);
      }
      return normalized;
    }) : [];

    return {
      users,
      accounts: Array.isArray(snapshot.accounts) ? snapshot.accounts : [],
      transactions: Array.isArray(snapshot.transactions) ? snapshot.transactions : [],
      activityLogs: Array.isArray(snapshot.activityLogs) ? snapshot.activityLogs : [],
    };
  }

  hydrateFromSnapshot(snapshot) {
    const users = Array.isArray(snapshot.users) ? snapshot.users : [];
    const accounts = Array.isArray(snapshot.accounts) ? snapshot.accounts : [];
    const transactions = Array.isArray(snapshot.transactions) ? snapshot.transactions : [];
    const activityLogs = Array.isArray(snapshot.activityLogs) ? snapshot.activityLogs : [];
    const subscriptions = Array.isArray(snapshot.subscriptions) ? snapshot.subscriptions : [];

    this.users.clear();
    this.accounts.clear();
    this.transactions.clear();
    this.activityLogs.clear();
    this.subscriptions.clear();

    users.forEach((user) => this.users.set(user.id, { ...user, createdAt: user.createdAt ? new Date(user.createdAt) : user.createdAt }));
    accounts.forEach((account) => this.accounts.set(account.id, { ...account, createdAt: account.createdAt ? new Date(account.createdAt) : account.createdAt }));
    transactions.forEach((transaction) => this.transactions.set(transaction.id, { ...transaction, createdAt: transaction.createdAt ? new Date(transaction.createdAt) : transaction.createdAt }));
    activityLogs.forEach((log) => this.activityLogs.set(log.id, { ...log, timestamp: log.timestamp ? new Date(log.timestamp) : log.timestamp }));
    subscriptions.forEach((sub) => this.subscriptions.set(sub.id, { ...sub, createdAt: sub.createdAt ? new Date(sub.createdAt) : sub.createdAt, nextBillingDate: sub.nextBillingDate ? new Date(sub.nextBillingDate) : sub.nextBillingDate }));
  }

  _atomicWrite(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, data, 'utf8');
    fs.renameSync(tmpPath, filePath);
  }

  async persistAllData() {
    try {
      const snapshot = this.getSnapshot();
      const json = JSON.stringify(snapshot, null, 2);
      this._atomicWrite(RUNTIME_DATA_PATH, json);
    } catch (err) {
      console.error('[DataStore] Failed to persist data:', err.message);
    }
  }

  createBackup() {
    try {
      if (!fs.existsSync(RUNTIME_DATA_PATH)) return;
      const stat = fs.statSync(RUNTIME_DATA_PATH);
      if (stat.size === 0) return;
      const parsed = this._tryReadJson(RUNTIME_DATA_PATH);
      if (!this._isValidSnapshot(parsed)) {
        console.warn('[DataStore] Skipping backup — runtimeData.json invalid');
        return;
      }
      if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, 'runtimeData-' + timestamp + '.json');
      fs.copyFileSync(RUNTIME_DATA_PATH, backupPath);
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('runtimeData-') && f.endsWith('.json'))
        .sort();
      while (files.length > MAX_BACKUPS) {
        const oldest = files.shift();
        fs.unlinkSync(path.join(BACKUP_DIR, oldest));
      }
      console.log('[DataStore] Backup created: ' + path.basename(backupPath) + ' (' + parsed.users.length + ' users, ' + (parsed.accounts || []).length + ' accounts, ' + (parsed.transactions || []).length + ' txns)');
    } catch (err) {
      console.error('[DataStore] Backup failed:', err.message);
    }
  }

  _startAutoBackup() {
    this.createBackup();
    this._backupTimer = setInterval(() => this.createBackup(), BACKUP_INTERVAL_MS);
    if (this._backupTimer.unref) this._backupTimer.unref();
  }

  getSnapshot() {
    const allLogs = Array.from(this.activityLogs.values());
    const cappedLogs = allLogs.length > MAX_ACTIVITY_LOGS
      ? allLogs.slice(-MAX_ACTIVITY_LOGS)
      : allLogs;
    return {
      users: Array.from(this.users.values()),
      accounts: Array.from(this.accounts.values()),
      transactions: Array.from(this.transactions.values()),
      activityLogs: cappedLogs,
      subscriptions: Array.from(this.subscriptions.values()),
    };
  }

  initializeSampleData() {
    sampleUsers.forEach((user) => this.users.set(user.id, { ...user }));
    sampleAccounts.forEach((account) => this.accounts.set(account.id, { ...account }));
    sampleTransactions.forEach((transaction) => this.transactions.set(transaction.id, { ...transaction }));
    sampleActivityLogs.forEach((log) => this.activityLogs.set(log.id, { ...log }));
    sampleSubscriptions.forEach((sub) => this.subscriptions.set(sub.id, { ...sub }));
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  getUserById(id) {
    return this.users.get(id);
  }

  getUserByUsername(username) {
    return Array.from(this.users.values()).find((user) => user.username === username);
  }

  async createUser(userData) {
    const id = uuidv4();
    const user = { id, ...userData, createdAt: new Date(), isActive: true };
    this.users.set(id, user);
    await this.persistAllData();
    return user;
  }

  /**
   * Create a user row keyed by id if missing (e.g. serverless cold start after session still holds profile).
   * Does not overwrite an existing user.
   * @param {string} id - Banking user id (session / canonical id)
   * @param {object} seed - Defaults from session or token claims
   */
  async ensureUser(id, seed = {}) {
    if (!id) return null;
    const existing = this.users.get(id);
    if (existing) return existing;
    const username =
      (typeof seed.username === 'string' && seed.username.trim()) ||
      (typeof seed.email === 'string' && seed.email.trim()) ||
      `user_${String(id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'demo'}`;
    const user = {
      id,
      username,
      email: typeof seed.email === 'string' ? seed.email.trim() : '',
      firstName: typeof seed.firstName === 'string' ? seed.firstName : '',
      lastName: typeof seed.lastName === 'string' ? seed.lastName : '',
      role: seed.role || 'customer',
      isActive: seed.isActive !== false,
      password: seed.password != null ? seed.password : null,
      oauthProvider: seed.oauthProvider || null,
      oauthId: seed.oauthId || null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    await this.persistAllData();
    return user;
  }

  async updateUser(id, updates) {
    const user = this.users.get(id);
    if (!user) return null;
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    await this.persistAllData();
    return updatedUser;
  }

  async deleteUser(id) {
    const deleted = this.users.delete(id);
    if (deleted) await this.persistAllData();
    return deleted;
  }

  /**
   * Account schema fields (stored in in-memory Map, passed through from createAccount):
   * id, userId, accountType, name, balance, currency, status, createdAt, isActive,
   * accountNumberFull (12-digit raw, e.g. "010123456789"),
   * accountNumber (masked display value "****XXXX"),
   * routingNumber (9-digit ABA routing, sensitive — omitted from GET /api/accounts/my),
   * swiftCode (e.g. "CHASUS33"), iban, branchName, branchCode,
   * openedDate (ISO date string), accountHolderName.
   */
  getAllAccounts() {
    return Array.from(this.accounts.values());
  }

  getAccountById(id) {
    return this.accounts.get(id);
  }

  getAccountsByUserId(userId) {
    return Array.from(this.accounts.values()).filter((account) => account.userId === userId);
  }

  async createAccount(accountData) {
    const id = accountData.id || uuidv4();
    const account = {
      ...accountData,
      id,
      createdAt: accountData.createdAt || new Date(),
      isActive: accountData.isActive !== undefined ? accountData.isActive : true,
    };
    this.accounts.set(id, account);
    await this.persistAllData();
    return account;
  }

  async updateAccount(id, updates) {
    const account = this.accounts.get(id);
    if (!account) return null;
    const updatedAccount = { ...account, ...updates };
    this.accounts.set(id, updatedAccount);
    await this.persistAllData();
    return updatedAccount;
  }

  async deleteAccount(id) {
    const deleted = this.accounts.delete(id);
    if (deleted) await this.persistAllData();
    return deleted;
  }

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  getTransactionById(id) {
    return this.transactions.get(id);
  }

  getTransactionsByUserId(userId) {
    return Array.from(this.transactions.values()).filter((transaction) => transaction.userId === userId);
  }

  getTransactionsByAccountId(accountId) {
    return Array.from(this.transactions.values()).filter(
      (transaction) => transaction.fromAccountId === accountId || transaction.toAccountId === accountId
    );
  }

  async createTransaction(transactionData) {
    const id = uuidv4();
    const transaction = { id, ...transactionData, createdAt: new Date(), status: 'completed' };
    this.transactions.set(id, transaction);
    await this.persistAllData();
    return transaction;
  }

  async updateTransaction(id, updates) {
    const transaction = this.transactions.get(id);
    if (!transaction) return null;
    const updatedTransaction = { ...transaction, ...updates };
    this.transactions.set(id, updatedTransaction);
    await this.persistAllData();
    return updatedTransaction;
  }

  async deleteTransaction(id) {
    const deleted = this.transactions.delete(id);
    if (deleted) await this.persistAllData();
    return deleted;
  }

  getAllActivityLogs() {
    return Array.from(this.activityLogs.values());
  }

  getActivityLogById(id) {
    return this.activityLogs.get(id);
  }

  getActivityLogsByUserId(userId) {
    return Array.from(this.activityLogs.values()).filter((log) => log.userId === userId);
  }

  getActivityLogsByUsername(username) {
    return Array.from(this.activityLogs.values()).filter((log) => log.username === username);
  }

  async createActivityLog(logData) {
    const id = uuidv4();
    const log = { id, ...logData, timestamp: new Date() };
    this.activityLogs.set(id, log);
    this.persistAllData().catch((error) => {
      console.error('Error saving activity log:', error);
    });
    return log;
  }

  getAccountBalance(accountId) {
    const account = this.accounts.get(accountId);
    return account ? account.balance : 0;
  }

  async updateAccountBalance(accountId, amount) {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    account.balance += amount;
    this.accounts.set(accountId, account);
    await this.persistAllData();
    return true;
  }

  searchUsers(query) {
    const q = query.toLowerCase();
    return Array.from(this.users.values()).filter(
      (user) =>
        user.firstName.toLowerCase().includes(q) ||
        user.lastName.toLowerCase().includes(q) ||
        user.username.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q)
    );
  }

  searchTransactions(query) {
    const q = query.toLowerCase();
    return Array.from(this.transactions.values()).filter(
      (transaction) =>
        transaction.description.toLowerCase().includes(q) ||
        transaction.type.toLowerCase().includes(q)
    );
  }

  // ── Subscription CRUD ────────────────────────────────────────────────────────

  getAllSubscriptions() {
    return Array.from(this.subscriptions.values());
  }

  getSubscriptionById(id) {
    return this.subscriptions.get(id);
  }

  getSubscriptionsByUserId(userId) {
    return Array.from(this.subscriptions.values()).filter((s) => s.userId === userId);
  }

  async createSubscription(data) {
    const id = uuidv4();
    const subscription = {
      id,
      ...data,
      status: data.status || 'active',
      createdAt: new Date(),
      nextBillingDate: data.nextBillingDate || null,
    };
    this.subscriptions.set(id, subscription);
    await this.persistAllData();
    return subscription;
  }

  async updateSubscription(id, updates) {
    const subscription = this.subscriptions.get(id);
    if (!subscription) return null;
    const updated = { ...subscription, ...updates };
    this.subscriptions.set(id, updated);
    await this.persistAllData();
    return updated;
  }

  async deleteSubscription(id) {
    const deleted = this.subscriptions.delete(id);
    if (deleted) await this.persistAllData();
    return deleted;
  }
}

const dataStore = new DataStore();

module.exports = dataStore;
