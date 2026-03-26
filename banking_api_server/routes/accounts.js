const express = require('express');
const router = express.Router();
const dataStore = require('../data/store');
const { authenticateToken, requireScopes } = require('../middleware/auth');
const { blockInDemoMode } = require('../middleware/demoMode');

// Get all accounts (admin only)
router.get('/', authenticateToken, requireScopes(['banking:accounts:read', 'banking:read']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const accounts = dataStore.getAllAccounts();
    res.json({ accounts });
  } catch (error) {
    console.error('Error getting accounts:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// Provision demo accounts + sample history for a user. Idempotent — always resets balances.
async function provisionDemoAccounts(userId) {
  const uid = userId.replace(/-/g, '').slice(0, 10);
  const checkingId = `chk-${uid}`;
  const savingsId  = `sav-${uid}`;

  // Remove existing accounts for this user so we can reset balances cleanly
  const existing = dataStore.getAccountsByUserId(userId);
  const deletedAccountIds = new Set(existing.map((a) => a.id));
  for (const acct of existing) {
    await dataStore.deleteAccount(acct.id);
  }
  // Remove only transactions tied to deleted accounts (do not wipe all user txns when existing.length === 0)
  const existingTxns = dataStore.getTransactionsByUserId(userId);
  for (const txn of existingTxns) {
    const touchesDeleted =
      (txn.fromAccountId && deletedAccountIds.has(txn.fromAccountId)) ||
      (txn.toAccountId && deletedAccountIds.has(txn.toAccountId));
    if (touchesDeleted) {
      await dataStore.deleteTransaction(txn.id);
    }
  }

  const checking = await dataStore.createAccount({
    id: checkingId, userId,
    accountNumber: `CHK-${uid.toUpperCase()}`, accountType: 'checking',
    balance: 3000.00, currency: 'USD', name: 'Checking Account',
    createdAt: new Date('2024-01-15'),
  });
  const savings = await dataStore.createAccount({
    id: savingsId, userId,
    accountNumber: `SAV-${uid.toUpperCase()}`, accountType: 'savings',
    balance: 2000.00, currency: 'USD', name: 'Savings Account',
    createdAt: new Date('2024-01-15'),
  });

  const sampleTxns = [
    { fromAccountId: null,        toAccountId: checkingId, amount: 3500.00, type: 'deposit',    description: 'Direct deposit – Payroll',    createdAt: new Date('2024-03-01T09:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: savingsId,  amount:  500.00, type: 'transfer',   description: 'Monthly savings transfer',    createdAt: new Date('2024-03-03T11:15:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:  120.00, type: 'withdrawal', description: 'ATM withdrawal',              createdAt: new Date('2024-03-07T14:30:00Z') },
    { fromAccountId: null,        toAccountId: savingsId,  amount:  250.00, type: 'deposit',    description: 'Tax refund deposit',          createdAt: new Date('2024-03-10T10:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:   85.50, type: 'withdrawal', description: 'Grocery store',              createdAt: new Date('2024-03-14T17:45:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:  200.00, type: 'withdrawal', description: 'Utility bill – Electric',    createdAt: new Date('2024-03-18T08:00:00Z') },
    { fromAccountId: null,        toAccountId: checkingId, amount:   75.00, type: 'deposit',    description: 'Reimbursement',              createdAt: new Date('2024-03-20T13:00:00Z') },
  ];
  for (const txn of sampleTxns) {
    await dataStore.createTransaction({ ...txn, userId, status: 'completed' });
  }

  return [checking, savings];
}

// Get user's own accounts — auto-provisions demo accounts on first load
// Uses authenticated session only (scope-independent) so customer dashboard always hydrates.
router.get('/my', authenticateToken, async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  try {
    let userAccounts = dataStore.getAccountsByUserId(req.user.id);
    if (userAccounts.length === 0 && req.user.id) {
      userAccounts = await provisionDemoAccounts(req.user.id);
    }
    res.json({ accounts: userAccounts });
  } catch (error) {
    console.error('Error getting user accounts:', error);
    res.status(500).json({ error: 'Failed to get your accounts' });
  }
});

// Reset demo — restore accounts to $5,000 starting balances with fresh sample history
router.post('/reset-demo', authenticateToken, async (req, res) => {
  try {
    const accounts = await provisionDemoAccounts(req.user.id);
    res.json({ message: 'Demo reset successfully', accounts });
  } catch (error) {
    console.error('Error resetting demo:', error);
    res.status(500).json({ error: 'Failed to reset demo' });
  }
});

// Admin: reset ALL demo-provisioned OAuth accounts back to $5,000 starting balances
router.post('/reset-all-demo', authenticateToken, requireScopes(['banking:write']), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required.' });
    }
    // Find all OAuth-provisioned accounts (deterministic IDs start with chk- or sav-)
    const allAccounts = dataStore.getAllAccounts();
    const demoAccounts = allAccounts.filter(a => a.id.startsWith('chk-') || a.id.startsWith('sav-'));
    // Collect the userIds so we can also clear their transactions
    const demoUserIds = [...new Set(demoAccounts.map(a => a.userId))];
    for (const acct of demoAccounts) {
      await dataStore.deleteAccount(acct.id);
    }
    for (const uid of demoUserIds) {
      const txns = dataStore.getTransactionsByUserId(uid);
      for (const txn of txns) {
        await dataStore.deleteTransaction(txn.id);
      }
    }
    res.json({ message: `Reset ${demoUserIds.length} demo user(s). Fresh accounts will be provisioned on next login.` });
  } catch (error) {
    console.error('Error resetting all demo accounts:', error);
    res.status(500).json({ error: 'Failed to reset demo accounts' });
  }
});

// Get account by ID (admin only)
router.get('/:id', authenticateToken, requireScopes(['banking:accounts:read', 'banking:read']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const account = dataStore.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ account });
  } catch (error) {
    console.error('Error getting account:', error);
    res.status(500).json({ error: 'Failed to get account' });
  }
});

// Get account balance (admin or account owner)
router.get('/:id/balance', authenticateToken, requireScopes(['banking:accounts:read', 'banking:read']), async (req, res) => {
  try {
    const account = dataStore.getAccountById(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if user is admin or account owner
    if (req.user.role !== 'admin' && account.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only check your own account balance.' });
    }
    
    const balance = dataStore.getAccountBalance(req.params.id);
    res.json({ balance });
  } catch (error) {
    console.error('Error getting account balance:', error);
    res.status(500).json({ error: 'Failed to get account balance' });
  }
});

// Create new account (admin only)
router.post('/', blockInDemoMode('account creation'), authenticateToken, requireScopes(['banking:write']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const account = await dataStore.createAccount(req.body);
    res.status(201).json({ message: 'Account created successfully', account });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account (admin only)
router.put('/:id', blockInDemoMode('account update'), authenticateToken, requireScopes(['banking:write']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const account = await dataStore.updateAccount(req.params.id, req.body);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Account updated successfully', account });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account (admin only)
router.delete('/:id', blockInDemoMode('account deletion'), authenticateToken, requireScopes(['banking:write']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const deleted = await dataStore.deleteAccount(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.provisionDemoAccounts = provisionDemoAccounts;
module.exports = router;
