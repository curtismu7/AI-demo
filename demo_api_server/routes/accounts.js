const express = require('express');
const router = express.Router();
const dataStore = require('../data/store');
const { authenticateToken, requireScopes, requireNotBankDelegate } = require('../middleware/auth');
const { blockInDemoMode } = require('../middleware/demoMode');
const demoScenarioStore = require('../services/demoScenarioStore');
const posthog = require('../services/posthog');
const configStore = require('../services/configStore');
const { verticalManifest } = require('../services/verticalManifest');

// Guard: only one reseed can run at a time to prevent concurrent duplicate-account creation.
// waitForReseed() lets concurrent requests block instead of returning stale wrong-vertical data.
const _reseedGuard = { inProgress: false };
function waitForReseed(ms = 3000) {
  const deadline = Date.now() + ms;
  return new Promise((resolve) => {
    const check = () => _reseedGuard.inProgress
      ? (Date.now() < deadline ? setTimeout(check, 50) : resolve())
      : resolve();
    check();
  });
}

/**
 * Rebuild a user's accounts from a snapshot saved in demoScenarioStore (Redis/KV).
 * Called on cold-start when the in-memory store is empty so restored accounts
 * (e.g. investment accounts added via /demo-data) aren't lost.
 * Returns the restored accounts array, or [] if no snapshot exists.
 */
async function restoreAccountsFromSnapshot(userId) {
  try {
    const scenario = await demoScenarioStore.load(userId);
    if (!Array.isArray(scenario.accountSnapshot) || scenario.accountSnapshot.length === 0) return [];
    const restored = [];
    for (const snap of scenario.accountSnapshot) {
      const existing = dataStore.getAccountById(snap.id);
      if (existing) {
        restored.push(existing);
      } else {
        const acct = await dataStore.createAccount({ ...snap, userId, createdAt: new Date() });
        restored.push(acct);
      }
    }
    return restored;
  } catch (e) {
    console.warn('[accounts] restoreAccountsFromSnapshot failed:', e.message);
    return [];
  }
}

/**
 * Save current user accounts to demoScenarioStore (Redis/KV) for cold-start recovery.
 * Called after any account creation, update, or deletion.
 * Prevents "From account not found" errors when Vercel lambda is recycled.
 */
async function saveAccountSnapshot(userId) {
  try {
    const accounts = dataStore.getAccountsByUserId(userId);
    const scenario = await demoScenarioStore.load(userId);
    await demoScenarioStore.save(userId, {
      ...scenario,
      accountSnapshot: accounts || []
    });
    console.log(`[accounts] saved snapshot for userId=${userId} with ${(accounts || []).length} accounts`);
  } catch (e) {
    console.warn('[accounts] saveAccountSnapshot failed:', e.message);
  }
}

/**
 * Add a Car Loan account if the user has checking+savings but no loan.
 * Creates with the same deterministic ID provisionDemoAccounts would use,
 * so a subsequent full reprovision stays idempotent.
 */
async function addMissingLoanAccount(userId, existingAccounts) {
  const uid = userId.replace(/-/g, '').slice(0, 10);
  const loanId = `loan-${uid}`;
  const already = dataStore.getAccountById(loanId);
  if (already) return [...existingAccounts, already];

  const _acctDigits = uid.replace(/[^0-9a-f]/gi, '').slice(0, 10) || '0';
  const _acctN = parseInt(_acctDigits, 16) % 9999999999;
  const loanFull = '03' + String(_acctN).padStart(10, '0');
  const _ibanBase = parseInt(uid.replace(/[^0-9a-f]/gi, '').slice(0, 8) || '0', 16);
  const _ibanSfx3 = String((_ibanBase + 2) % 100000000).padStart(8, '0');

  const carLoan = await dataStore.createAccount({
    id: loanId, userId,
    accountNumberFull: loanFull,
    accountNumber: `****${loanFull.slice(-4)}`,
    accountType: 'loan',
    balance: -12000.00, currency: 'USD', name: 'Car Loan',
    routingNumber: '026073150',
    swiftCode: 'CHASUS33',
    iban: `US12CHAS${_ibanSfx3}`,
    branchName: 'Super Banking Main Branch',
    branchCode: '001',
    openedDate: '2023-06-01',
    accountHolderName: '',
    createdAt: new Date('2024-01-15'),
  });
  await saveAccountSnapshot(userId);
  return [...existingAccounts, carLoan];
}

// Get all accounts (admin only)
router.get('/', authenticateToken, requireScopes(['read']), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    const accounts = dataStore.getAllAccounts();
    const allUsers = dataStore.getAllUsers();
    const userMap = {};
    for (const u of allUsers) {
      userMap[u.id] = u;
    }
    const enriched = accounts.map((acct) => {
      const owner = acct.userId ? userMap[acct.userId] : null;
      return {
        ...acct,
        ownerUsername: owner?.username || acct.userId || 'unknown',
        ownerEmail: owner?.email || null,
        ownerName: owner ? `${owner.firstName || ''} ${owner.lastName || ''}`.trim() : null,
      };
    });
    res.json({ accounts: enriched });
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
  const loanId     = `loan-${uid}`;

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

  // Generate realistic 12-digit account numbers from user uid
  const _acctDigits = uid.replace(/[^0-9a-f]/gi, '').slice(0, 10) || '0';
  const _acctN = parseInt(_acctDigits, 16) % 9999999999;
  const checkingFull = '01' + String(_acctN).padStart(10, '0');
  const savingsFull  = '02' + String(_acctN).padStart(10, '0');
  const loanFull     = '03' + String(_acctN).padStart(10, '0');
  const _ibanBase    = parseInt(uid.replace(/[^0-9a-f]/gi, '').slice(0, 8) || '0', 16);
  const _ibanSfx1    = String(_ibanBase % 100000000).padStart(8, '0');
  const _ibanSfx2    = String((_ibanBase + 1) % 100000000).padStart(8, '0');
  const _ibanSfx3    = String((_ibanBase + 2) % 100000000).padStart(8, '0');

  const checking = await dataStore.createAccount({
    id: checkingId, userId,
    accountNumberFull: checkingFull,
    accountNumber: `****${checkingFull.slice(-4)}`,
    accountType: 'checking',
    balance: 5000.00, currency: 'USD', name: 'Checking Account',
    routingNumber: '026073150',
    swiftCode: 'CHASUS33',
    iban: `US12CHAS${_ibanSfx1}`,
    branchName: 'Super Banking Main Branch',
    branchCode: '001',
    openedDate: '2022-01-15',
    accountHolderName: '',
    createdAt: new Date('2024-01-15'),
  });
  const savings = await dataStore.createAccount({
    id: savingsId, userId,
    accountNumberFull: savingsFull,
    accountNumber: `****${savingsFull.slice(-4)}`,
    accountType: 'savings',
    balance: 5000.00, currency: 'USD', name: 'Savings Account',
    routingNumber: '021000021',
    swiftCode: 'CHASUS33',
    iban: `US12CHAS${_ibanSfx2}`,
    branchName: 'Super Banking Main Branch',
    branchCode: '001',
    openedDate: '2022-03-10',
    accountHolderName: '',
    createdAt: new Date('2024-01-15'),
  });
  const carLoan = await dataStore.createAccount({
    id: loanId, userId,
    accountNumberFull: loanFull,
    accountNumber: `****${loanFull.slice(-4)}`,
    accountType: 'loan',
    balance: -12000.00, currency: 'USD', name: 'Car Loan',
    routingNumber: '026073150',
    swiftCode: 'CHASUS33',
    iban: `US12CHAS${_ibanSfx3}`,
    branchName: 'Super Banking Main Branch',
    branchCode: '001',
    openedDate: '2023-06-01',
    accountHolderName: '',
    createdAt: new Date('2024-01-15'),
  });

  // Save snapshot for cold-start recovery
  await saveAccountSnapshot(userId);

  const sampleTxns = [
    { fromAccountId: null,        toAccountId: checkingId, amount: 3500.00, type: 'deposit',    description: 'Direct deposit – Payroll',    createdAt: new Date('2024-03-01T09:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: savingsId,  amount:  500.00, type: 'transfer',   description: 'Monthly savings transfer',    createdAt: new Date('2024-03-03T11:15:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:  120.00, type: 'withdrawal', description: 'ATM withdrawal',              createdAt: new Date('2024-03-07T14:30:00Z') },
    { fromAccountId: null,        toAccountId: savingsId,  amount:  250.00, type: 'deposit',    description: 'Tax refund deposit',          createdAt: new Date('2024-03-10T10:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:   85.50, type: 'withdrawal', description: 'Grocery store',              createdAt: new Date('2024-03-14T17:45:00Z') },
    { fromAccountId: checkingId,  toAccountId: null,       amount:  200.00, type: 'withdrawal', description: 'Utility bill – Electric',    createdAt: new Date('2024-03-18T08:00:00Z') },
    { fromAccountId: null,        toAccountId: checkingId, amount:   75.00, type: 'deposit',    description: 'Reimbursement',              createdAt: new Date('2024-03-20T13:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: loanId,     amount:  450.00, type: 'payment',    description: 'Car loan payment',           createdAt: new Date('2024-03-05T08:00:00Z') },
    { fromAccountId: checkingId,  toAccountId: loanId,     amount:  450.00, type: 'payment',    description: 'Car loan payment',           createdAt: new Date('2024-02-05T08:00:00Z') },
  ];
  for (const txn of sampleTxns) {
    await dataStore.createTransaction({ ...txn, userId, status: 'completed' });
  }

  return [checking, savings, carLoan];
}

// Get user's own accounts — auto-provisions demo accounts on first load
// Uses authenticated session only (scope-independent) so customer dashboard always hydrates.
router.get('/my', authenticateToken, async (req, res) => {
  res.set({ 'Cache-Control': 'private, no-store' });
  try {
    let userAccounts = dataStore.getAccountsByUserId(req.user.id);

    const activeVertical = configStore.getEffective('active_vertical') || 'banking';
    // Primary accountType derived from active vertical's manifest
    // (was hardcoded VERTICAL_PRIMARY_TYPE map; now read from manifest.terminology.accountTypes[0]).
    const activeManifestEntry = verticalManifest.loader.get(activeVertical);
    const expectedPrimaryType = activeManifestEntry?.manifest?.terminology?.accountTypes?.[0];

    // For the banking vertical, also check the legacy loan completeness guard.
    const hasChecking = () => userAccounts.some(a => (a.accountType || a.type) === 'CHECKING' || (a.accountType || a.type) === 'checking');
    const hasSavings  = () => userAccounts.some(a => (a.accountType || a.type) === 'SAVINGS'  || (a.accountType || a.type) === 'savings');
    const hasLoan     = () => userAccounts.some(a => (a.accountType || a.type) === 'loan');

    // Case-insensitive mismatch: provisionDemoAccounts writes lowercase 'checking'/'savings'
    // while the banking seed file uses 'CHECKING'/'SAVINGS' — normalise before comparing.
    const primaryType = (userAccounts[0]?.accountType || '').toLowerCase();
    const expectedLower = (expectedPrimaryType || '').toLowerCase();
    const verticalMismatch = userAccounts.length > 0 && expectedLower && primaryType !== expectedLower;

    if (req.user.id && (userAccounts.length === 0 || verticalMismatch)) {
      if (userAccounts.length === 0) {
        // On cold-start the in-memory store is empty. Try to restore from the persisted
        // account snapshot (Redis/KV) before falling back to fresh provisioning.
        userAccounts = await restoreAccountsFromSnapshot(req.user.id);
      }

      // After restore, re-check for vertical mismatch (case-insensitive).
      const restoredPrimary = (userAccounts[0]?.accountType || '').toLowerCase();
      const stillMismatched = userAccounts.length === 0 ||
        (expectedLower && restoredPrimary !== expectedLower);

      if (stillMismatched && _reseedGuard.inProgress) {
        await waitForReseed();
        userAccounts = dataStore.getAccountsByUserId(req.user.id);
      } else if (stillMismatched) {
        _reseedGuard.inProgress = true;
        try {
          // Wipe stale accounts and reseed all customers for the active vertical.
          await dataStore.reseedAllCustomersForVertical(activeVertical);
          // Update demoScenarioStore snapshots for every customer so cold-start
          // restore doesn't return wrong-vertical accounts for other users.
          const customers = Array.from(dataStore.users.values()).filter(u => u.role === 'customer');
          await Promise.all(customers.map(async (u) => {
            const accts = dataStore.getAccountsByUserId(u.id);
            const snap = accts.map(a => ({
              id: a.id, accountType: a.accountType, accountNumber: a.accountNumber,
              name: a.name || '', balance: a.balance, currency: a.currency || 'USD', isActive: true,
            }));
            await demoScenarioStore.save(u.id, { accountSnapshot: snap });
          }));
        } finally {
          _reseedGuard.inProgress = false;
        }
        userAccounts = dataStore.getAccountsByUserId(req.user.id);
      }
    }

    // For the banking vertical only: add car loan if missing without wiping existing accounts/balances.
    if (req.user.id && activeVertical === 'banking' && hasChecking() && hasSavings() && !hasLoan()) {
      userAccounts = await addMissingLoanAccount(req.user.id, userAccounts);
    }
    res.json({
      accounts: userAccounts.map(account => ({
        id: account.id,
        accountType: account.accountType,
        name: account.name,
        balance: account.balance,
        currency: account.currency,
        status: account.status || 'active',
        accountNumber: account.accountNumber || ('****' + (account.accountNumberFull || '').slice(-4)),
        swiftCode: account.swiftCode || 'CHASUS33',
        iban: account.iban || '',
        branchName: account.branchName || 'Super Banking Main Branch',
        branchCode: account.branchCode || '001',
        openedDate: account.openedDate || null,
        accountHolderName: req.user && (req.user.name || (req.user.given_name ? req.user.given_name + ' ' + (req.user.family_name || '') : null) || req.user.sub) || '',
        createdAt: account.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error getting user accounts:', error);
    res.status(500).json({ error: 'Failed to get your accounts' });
  }
});

// Reset demo — restore accounts to $5,000 starting balances with fresh sample history
router.post('/reset-demo', authenticateToken, async (req, res) => {
  try {
    const accounts = await provisionDemoAccounts(req.user.id);
    // Clear the account snapshot so cold-start restores the fresh 2-account defaults,
    // not the old custom configuration that was just reset.
    const snapshot = accounts.map(a => ({
      id: a.id, accountType: a.accountType, accountNumber: a.accountNumber,
      name: a.name || '', balance: a.balance, currency: a.currency || 'USD', isActive: true,
    }));
    await demoScenarioStore.save(req.user.id, { accountSnapshot: snapshot });
    posthog.capture({ distinctId: req.user.id, event: 'demo_reset' });
    res.json({ message: 'Demo reset successfully', accounts });
  } catch (error) {
    console.error('Error resetting demo:', error);
    res.status(500).json({ error: 'Failed to reset demo' });
  }
});

// Admin: reset ALL demo-provisioned OAuth accounts back to $5,000 starting balances
router.post('/reset-all-demo', authenticateToken, requireScopes(['write']), async (req, res) => {
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
      // Save empty snapshot for cold-start recovery
      await saveAccountSnapshot(uid);
    }
    res.json({ message: `Reset ${demoUserIds.length} demo user(s). Fresh accounts will be provisioned on next login.` });
  } catch (error) {
    console.error('Error resetting all demo accounts:', error);
    res.status(500).json({ error: 'Failed to reset demo accounts' });
  }
});

// Get account by ID (admin only)
router.get('/:id', authenticateToken, requireScopes(['read']), async (req, res) => {
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
router.get('/:id/balance', authenticateToken, requireScopes(['read']), async (req, res) => {
  try {
    let account = dataStore.getAccountById(req.params.id);
    // Fallback: resolve type-name IDs like "checking"/"savings" (UI uses these before liveAccounts loads)
    if (!account && req.user) {
      const userAccounts = dataStore.getAccountsByUserId(req.user.id);
      const typeName = req.params.id.toLowerCase().replace(/^(my|the|primary|main)\s+/, '');
      account = userAccounts.find(a =>
        String(a.accountType || '').toLowerCase() === typeName ||
        String(a.name || '').toLowerCase().includes(typeName)
      );
    }
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if user is admin or account owner
    if (req.user.role !== 'admin' && account.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only check your own account balance.' });
    }
    
    const balance = dataStore.getAccountBalance(account.id);
    res.json({ balance });
  } catch (error) {
    console.error('Error getting account balance:', error);
    res.status(500).json({ error: 'Failed to get account balance' });
  }
});

// Create new account (admin only)
router.post('/', blockInDemoMode('account creation'), authenticateToken, requireScopes(['write']), requireNotBankDelegate('account creation'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const account = await dataStore.createAccount(req.body);
    // Save snapshot for cold-start recovery
    await saveAccountSnapshot(account.userId);
    res.status(201).json({ message: 'Account created successfully', account });
  } catch (error) {
    console.error('Error creating account:', error);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// Update account (admin only)
router.put('/:id', blockInDemoMode('account update'), authenticateToken, requireScopes(['write']), requireNotBankDelegate('account update'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    const account = await dataStore.updateAccount(req.params.id, req.body);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    // Save snapshot for cold-start recovery
    await saveAccountSnapshot(account.userId);
    res.json({ message: 'Account updated successfully', account });
  } catch (error) {
    console.error('Error updating account:', error);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// Delete account (admin only)
router.delete('/:id', blockInDemoMode('account deletion'), authenticateToken, requireScopes(['write']), requireNotBankDelegate('account deletion'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }

    // Get account before deletion to know which user to update snapshot for
    const account = dataStore.getAccountById(req.params.id);
    const deleted = await dataStore.deleteAccount(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Account not found' });
    }
    // Save snapshot for cold-start recovery
    if (account) {
      await saveAccountSnapshot(account.userId);
    }
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

router.provisionDemoAccounts = provisionDemoAccounts;
module.exports = router;
