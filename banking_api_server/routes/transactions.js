const express = require('express');
const router = express.Router();
const dataStore = require('../data/store');
const { authenticateToken, requireScopes } = require('../middleware/auth');
const { blockInDemoMode } = require('../middleware/demoMode');
const runtimeSettings = require('../config/runtimeSettings');
const pingOneAuthorizeService = require('../services/pingOneAuthorizeService');
const configStore = require('../services/configStore');
const { sendTransactionConfirmation } = require('../services/emailService');
const txConsent = require('../services/transactionConsentChallenge');

// Get all transactions (admin only)
router.get('/', authenticateToken, requireScopes(['banking:transactions:read', 'banking:read']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const transactions = dataStore.getAllTransactions();
    const transactionsWithNames = transactions.map(transaction => {
      const user = dataStore.getUserById(transaction.userId);
      return {
        ...transaction,
        performedBy: user ? `${user.firstName} ${user.lastName}` : transaction.userId
      };
    });
    res.json({ transactions: transactionsWithNames });
  } catch (error) {
    console.error('Error getting transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});



// Get user's own transactions (end users)
// No banking:* scope required — standard PingOne tokens without a custom resource server
// only carry openid/profile/email. Once a resource server is configured in PingOne and
// ENDUSER_AUDIENCE is set, restore: requireScopes(['banking:transactions:read', 'banking:read'])
router.get('/my', authenticateToken, async (req, res) => {
  try {
    // Add cache headers for frequent polling
    res.set({
      'Cache-Control': 'private, max-age=10', // Cache for 10 seconds
      'ETag': `"transactions-${req.user.id}-${Date.now()}"`,
    });
    
    const userTransactions = dataStore.getTransactionsByUserId(req.user.id);
    const user = dataStore.getUserById(req.user.id);
    const fullName = user ? `${user.firstName} ${user.lastName}` : req.user.username;
    
    // Add username and account information to each transaction
    const transactionsWithUsername = userTransactions.map(transaction => {
      // Get account information
      let accountInfo = 'Unknown';
      if (transaction.fromAccountId) {
        const fromAccount = dataStore.getAccountById(transaction.fromAccountId);
        if (fromAccount) {
          accountInfo = `${fromAccount.accountType} - ${fromAccount.accountNumber}`;
        }
      } else if (transaction.toAccountId) {
        const toAccount = dataStore.getAccountById(transaction.toAccountId);
        if (toAccount) {
          accountInfo = `${toAccount.accountType} - ${toAccount.accountNumber}`;
        }
      }
      
      return {
        ...transaction,
        performedBy: fullName,
        accountInfo: accountInfo
      };
    });
    
    res.json({ 
      transactions: transactionsWithUsername,
      timestamp: new Date().toISOString(),
      count: transactionsWithUsername.length
    });
  } catch (error) {
    console.error('Error getting user transactions:', error);
    res.status(500).json({ error: 'Failed to get your transactions' });
  }
});

// Session-bound consent challenge for high-value transactions (HITL). Registered before /:id so "consent-challenge" is not captured as an id.
// No banking:* scope required — same reasoning as POST /; session ownership is enforced inside txConsent.
router.post(
  '/consent-challenge',
  authenticateToken,
  (req, res) => {
    const result = txConsent.createChallenge(req, req.body);
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(201).json({
      challengeId: result.challengeId,
      expiresAt: result.expiresAt,
      snapshot: result.snapshot,
    });
  },
);

router.post(
  '/consent-challenge/:challengeId/confirm',
  authenticateToken,
  (req, res) => {
    const result = txConsent.confirmChallenge(req, req.params.challengeId);
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.status(200).json({
      challengeId: result.challengeId,
      confirmExpiresAt: result.confirmExpiresAt,
    });
  },
);

/** Read pending challenge snapshot for the consent UI (must be registered before GET /:id). */
router.get(
  '/consent-challenge/:challengeId',
  authenticateToken,
  (req, res) => {
    const result = txConsent.getChallenge(req, req.params.challengeId);
    if (!result.ok) return res.status(result.status).json(result.json);
    return res.json({
      challengeId: result.challengeId,
      snapshot: result.snapshot,
      status: result.status,
      expiresAt: result.expiresAt,
    });
  },
);

// Get transaction by ID (admin or transaction owner)
router.get('/:id', authenticateToken, requireScopes(['banking:transactions:read', 'banking:read']), async (req, res) => {
  try {
    const transaction = dataStore.getTransactionById(req.params.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Check if user is admin or transaction owner
    if (req.user.role !== 'admin' && transaction.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own transactions.' });
    }
    
    res.json({ transaction });
  } catch (error) {
    console.error('Error getting transaction:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

// Create new transaction (admin or end user)
// No banking:* scope required — standard PingOne tokens without a custom resource server
// only carry openid/profile/email. Once a resource server is configured in PingOne and
// ENDUSER_AUDIENCE is set, restore requireScopes(['banking:transactions:write', 'banking:write']).
// Ownership is enforced below (non-admin users can only act on their own accounts).
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { fromAccountId, toAccountId, amount, type, description, userId } = req.body;

    // Validate amount
    const parsedAmount = parseFloat(req.body.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'invalid_amount', message: 'Amount must be a positive number.' });
    }
    if (parsedAmount > 1_000_000) {
      return res.status(400).json({ error: 'amount_exceeds_limit', message: 'Transaction amount cannot exceed $1,000,000.' });
    }
    // Round to 2 decimal places to prevent floating-point manipulation
    req.body.amount = Math.round(parsedAmount * 100) / 100;

    const performingUser = dataStore.getUserById(req.user.id);
    const performedByName = performingUser ? `${performingUser.firstName} ${performingUser.lastName}` : req.user.username;

    // Validate required fields
    if (!amount || !type) {
      return res.status(400).json({ error: 'Missing required fields: amount and type' });
    }
    
    // For deposits, we need toAccountId
    if (type === 'deposit' && !toAccountId) {
      return res.status(400).json({ error: 'Missing required field: toAccountId for deposit' });
    }
    
    // For withdrawals, we need fromAccountId
    if (type === 'withdrawal' && !fromAccountId) {
      return res.status(400).json({ error: 'Missing required field: fromAccountId for withdrawal' });
    }
    
    // For transfers, we need both fromAccountId and toAccountId
    if (type === 'transfer' && (!fromAccountId || !toAccountId)) {
      return res.status(400).json({ error: 'Missing required fields: fromAccountId and toAccountId for transfer' });
    }
    
    // For end users, ensure they can only create transactions for their own accounts
    if (req.user.role !== 'admin') {
      // Validate accounts exist and user has access
      if (fromAccountId) {
        const fromAccount = dataStore.getAccountById(fromAccountId);
        if (!fromAccount) {
          return res.status(404).json({ error: 'From account not found' });
        }
        if (fromAccount.userId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied. You can only transfer from your own accounts.' });
        }
      }
      
      if (toAccountId) {
        const toAccount = dataStore.getAccountById(toAccountId);
        if (!toAccount) {
          return res.status(404).json({ error: 'To account not found' });
        }
        if (toAccount.userId !== req.user.id) {
          return res.status(403).json({ error: 'Access denied. You can only deposit to your own accounts.' });
        }
      }
      
      // Use the authenticated user's ID
      req.body.userId = req.user.id;
    }
    
    // Check if from account has sufficient balance (only for withdrawals and transfers)
    if (fromAccountId && (type === 'withdrawal' || type === 'transfer')) {
      const fromAccount = dataStore.getAccountById(fromAccountId);
      if (!fromAccount) {
        return res.status(404).json({ error: 'From account not found' });
      }
      if (fromAccount.balance < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
    }

    // ── High-value HITL consent (session-bound) ─────────────────────────────
    const hitlAmount = parseFloat(req.body.amount);
    if (
      req.user.role !== 'admin' &&
      ['deposit', 'withdrawal', 'transfer'].includes(type) &&
      hitlAmount > txConsent.HIGH_VALUE_CONSENT_USD
    ) {
      const consumed = txConsent.verifyAndConsumeChallenge(req, req.body.consentChallengeId, req.body);
      if (!consumed.ok) {
        return res.status(consumed.status).json(consumed.json);
      }
    }

    // ── Step-up MFA gate ─────────────────────────────────────────────────────
    // Transfers and withdrawals above the threshold require a fresh MFA token.
    // All values are read from runtimeSettings (configurable via admin UI at /settings).
    const STEP_UP_THRESHOLD = runtimeSettings.get('stepUpAmountThreshold');
    const STEP_UP_ACR = runtimeSettings.get('stepUpAcrValue');
    const STEP_UP_TYPES = runtimeSettings.get('stepUpTransactionTypes');
    const STEP_UP_ENABLED = runtimeSettings.get('stepUpEnabled');

    if (STEP_UP_ENABLED && req.user.role !== 'admin' && STEP_UP_TYPES.includes(type) && parseFloat(amount) >= STEP_UP_THRESHOLD) {
      const userAcr = req.user.acr;
      if (!userAcr || userAcr !== STEP_UP_ACR) {
        const stepUpMethod = configStore.getEffective('step_up_method') || runtimeSettings.get('stepUpMethod') || 'ciba';
        console.log(`[StepUp] Amount ${amount} exceeds threshold ${STEP_UP_THRESHOLD}. User ACR: ${userAcr}. Requiring step-up. Method: ${stepUpMethod}`);
        return res.status(428).json({
          error: 'step_up_required',
          error_description: `Transfers and withdrawals of $${STEP_UP_THRESHOLD} or more require additional authentication (MFA). Update this threshold in Admin → Security Settings.`,
          step_up_acr: STEP_UP_ACR,
          step_up_method: stepUpMethod,
          step_up_url: '/api/auth/oauth/user/stepup',
          amount_threshold: STEP_UP_THRESHOLD,
        });
      }
    }
    // ── End step-up gate ──────────────────────────────────────────────────────

    // ── PingOne Authorize gate ────────────────────────────────────────────────
    // When enabled, evaluates the transaction against the configured Authorize
    // policy decision point. Applies to transfers and withdrawals only.
    // configStore fields take precedence; runtimeSettings toggle allows live
    // enable/disable without a config save.
    const AUTHORIZE_ENABLED =
      (configStore.get('authorize_enabled') === 'true' || configStore.get('authorize_enabled') === true) ||
      runtimeSettings.get('authorizeEnabled');
    const AUTHORIZE_DECISION_ENDPOINT_ID = configStore.get('authorize_decision_endpoint_id');
    const AUTHORIZE_POLICY_ID =
      configStore.get('authorize_policy_id') ||
      runtimeSettings.get('authorizePolicyId');
    const AUTHORIZE_TYPES = ['transfer', 'withdrawal'];

    if (AUTHORIZE_ENABLED && (AUTHORIZE_DECISION_ENDPOINT_ID || AUTHORIZE_POLICY_ID) && req.user.role !== 'admin' && AUTHORIZE_TYPES.includes(type)) {
      try {
        const { decision, stepUpRequired, path: authorizePath, decisionId } = await pingOneAuthorizeService.evaluateTransaction({
          decisionEndpointId: AUTHORIZE_DECISION_ENDPOINT_ID,
          policyId: AUTHORIZE_POLICY_ID,
          userId: req.user.id,
          amount: parseFloat(amount),
          type,
          acr: req.user.acr,
        });
        const authorizeRef = AUTHORIZE_DECISION_ENDPOINT_ID || AUTHORIZE_POLICY_ID;
        console.log(`[Authorize] ${authorizePath} ${authorizeRef} — user ${req.user.id} — type ${type} — decision: ${decision} — stepUpRequired: ${stepUpRequired}${decisionId ? ` — decisionId: ${decisionId}` : ''}`);

        // Policy signalled that a step-up is required (obligation/advice)
        if (stepUpRequired) {
          const STEP_UP_ACR = runtimeSettings.get('stepUpAcrValue');
          const stepUpMethod = configStore.getEffective('step_up_method') || runtimeSettings.get('stepUpMethod') || 'ciba';
          return res.status(428).json({
            error: 'step_up_required',
            error_description: 'This transaction requires additional authentication (MFA) as required by the authorization policy.',
            step_up_acr: STEP_UP_ACR,
            step_up_method: stepUpMethod,
            step_up_url: '/api/auth/oauth/user/stepup',
            authorize_policy_id: AUTHORIZE_POLICY_ID,
          });
        }

        if (decision === 'DENY') {
          return res.status(403).json({
            error: 'transaction_denied',
            error_description: 'This transaction was denied by the authorization policy.',
            authorize_policy_id: AUTHORIZE_POLICY_ID,
          });
        }
      } catch (err) {
        // Fail open with a warning so a misconfigured Authorize integration
        // does not block all transactions. Change to fail-closed here if your
        // security posture requires it.
        console.warn(`[Authorize] Policy evaluation error — failing open: ${err.message}`);
      }
    }
    // ── End Authorize gate ────────────────────────────────────────────────────

    // For transfers, create two separate transactions
    if (type === 'transfer') {
      // Resolve account labels for human-readable descriptions
      const fromAccountInfo = dataStore.getAccountById(fromAccountId);
      const toAccountInfo = dataStore.getAccountById(toAccountId);
      const fromLabel = fromAccountInfo ? `${fromAccountInfo.accountType} - ${fromAccountInfo.accountNumber}` : fromAccountId;
      const toLabel = toAccountInfo ? `${toAccountInfo.accountType} - ${toAccountInfo.accountNumber}` : toAccountId;

      // Create withdrawal transaction from source account
      const withdrawalTransaction = await dataStore.createTransaction({
        fromAccountId: fromAccountId,
        toAccountId: null,
        amount: amount,
        type: 'withdrawal',
        description: `Transfer to ${toLabel}: ${description}`,
        userId: req.user.id || userId,
        performedBy: performedByName,
        clientType: req.user.clientType || 'unknown',
        tokenType: req.user.tokenType || 'unknown'
      });
      
      // Create deposit transaction to destination account
      const depositTransaction = await dataStore.createTransaction({
        fromAccountId: null,
        toAccountId: toAccountId,
        amount: amount,
        type: 'deposit',
        description: `Transfer from ${fromLabel}: ${description}`,
        userId: req.user.id || userId,
        performedBy: performedByName,
        clientType: req.user.clientType || 'unknown',
        tokenType: req.user.tokenType || 'unknown'
      });
      
      // Update account balances
      await dataStore.updateAccountBalance(fromAccountId, -amount);
      await dataStore.updateAccountBalance(toAccountId, amount);
      
      // Log transaction creation with client type
      console.log(`💰 [Transaction] Transfer created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const fromAcc  = dataStore.getAccountById(fromAccountId);
        const toAcc    = dataStore.getAccountById(toAccountId);
        const userName = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type: 'transfer',
          amount,
          fromAccount: fromAcc ? `${fromAcc.accountType} — ${fromAcc.accountNumber}` : fromAccountId,
          toAccount:   toAcc   ? `${toAcc.accountType} — ${toAcc.accountNumber}`     : toAccountId,
          newBalance:  dataStore.getAccountById(fromAccountId)?.balance,
          transactionId: withdrawalTransaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Transfer completed successfully',
        withdrawalTransaction,
        depositTransaction
      });
    } else {
      // For non-transfer transactions, create single transaction
      const transaction = await dataStore.createTransaction({
        fromAccountId,
        toAccountId,
        amount,
        type,
        description,
        userId: req.user.id || userId,
        performedBy: performedByName,
        clientType: req.user.clientType || 'unknown',
        tokenType: req.user.tokenType || 'unknown'
      });
      
      // Update account balances
      if (fromAccountId) {
        await dataStore.updateAccountBalance(fromAccountId, -amount);
      }
      if (toAccountId) {
        await dataStore.updateAccountBalance(toAccountId, amount);
      }
      
      // Log transaction creation with client type
      console.log(`💰 [Transaction] ${type} created by ${req.user.username} (${req.user.clientType || 'unknown'} via ${req.user.tokenType || 'unknown'}) - Amount: $${amount}`);

      // Send confirmation email via PingOne Notifications (fire-and-forget)
      {
        const accountId = toAccountId || fromAccountId;
        const account   = accountId ? dataStore.getAccountById(accountId) : null;
        const userName  = req.user.firstName || req.user.name || req.user.username;
        sendTransactionConfirmation(req.user.id, {
          type: type === 'withdrawal' ? 'withdrawal' : 'deposit',
          amount,
          fromAccount: fromAccountId ? (account ? `${account.accountType} — ${account.accountNumber}` : fromAccountId) : undefined,
          toAccount:   toAccountId   ? (account ? `${account.accountType} — ${account.accountNumber}` : toAccountId)   : undefined,
          newBalance:  account?.balance,
          transactionId: transaction.id,
          userName,
        });
      }

      res.status(201).json({
        message: 'Transaction created successfully',
        transaction
      });
    }
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
});

// Update transaction (admin only)
router.put('/:id', blockInDemoMode('transaction update'), authenticateToken, requireScopes(['banking:transactions:write', 'banking:write']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const transaction = await dataStore.updateTransaction(req.params.id, req.body);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ message: 'Transaction updated successfully', transaction });
  } catch (error) {
    console.error('Error updating transaction:', error);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

// Delete transaction (admin only)
router.delete('/:id', blockInDemoMode('transaction deletion'), authenticateToken, requireScopes(['banking:transactions:write', 'banking:write']), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' });
    }
    
    const deleted = await dataStore.deleteTransaction(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting transaction:', error);
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

module.exports = router;