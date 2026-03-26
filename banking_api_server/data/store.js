const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { sampleUsers, sampleAccounts, sampleTransactions, sampleActivityLogs } = require('./sampleData');

const DEFAULT_BOOTSTRAP_PATH = path.join(__dirname, 'bootstrapData.json');

class DataStore {
  constructor() {
    this.users = new Map();
    this.accounts = new Map();
    this.transactions = new Map();
    this.activityLogs = new Map();
    this.initializeData();
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

  loadBootstrapSnapshot() {
    const bootstrapFile = process.env.BANKING_BOOTSTRAP_FILE || DEFAULT_BOOTSTRAP_PATH;
    try {
      const raw = fs.readFileSync(bootstrapFile, 'utf8');
      const parsed = JSON.parse(raw);
      return this.normalizeBootstrap(parsed);
    } catch {
      return this.normalizeBootstrap({
        users: sampleUsers,
        accounts: sampleAccounts,
        transactions: sampleTransactions,
        activityLogs: sampleActivityLogs,
      });
    }
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

    this.users.clear();
    this.accounts.clear();
    this.transactions.clear();
    this.activityLogs.clear();

    users.forEach((user) => this.users.set(user.id, { ...user, createdAt: user.createdAt ? new Date(user.createdAt) : user.createdAt }));
    accounts.forEach((account) => this.accounts.set(account.id, { ...account, createdAt: account.createdAt ? new Date(account.createdAt) : account.createdAt }));
    transactions.forEach((transaction) => this.transactions.set(transaction.id, { ...transaction, createdAt: transaction.createdAt ? new Date(transaction.createdAt) : transaction.createdAt }));
    activityLogs.forEach((log) => this.activityLogs.set(log.id, { ...log, timestamp: log.timestamp ? new Date(log.timestamp) : log.timestamp }));
  }

  async persistAllData() {
    // In-memory runtime only by design: source-of-truth is committed JSON bootstrap.
    return;
  }

  getSnapshot() {
    return {
      users: Array.from(this.users.values()),
      accounts: Array.from(this.accounts.values()),
      transactions: Array.from(this.transactions.values()),
      activityLogs: Array.from(this.activityLogs.values()),
    };
  }

  initializeSampleData() {
    sampleUsers.forEach((user) => this.users.set(user.id, { ...user }));
    sampleAccounts.forEach((account) => this.accounts.set(account.id, { ...account }));
    sampleTransactions.forEach((transaction) => this.transactions.set(transaction.id, { ...transaction }));
    sampleActivityLogs.forEach((log) => this.activityLogs.set(log.id, { ...log }));
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
}

const dataStore = new DataStore();

module.exports = dataStore;
