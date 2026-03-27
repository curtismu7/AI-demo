const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const dataStore = require('../data/store');
const { requireAdmin, requireScopes } = require('../middleware/auth');
const runtimeSettings = require('../config/runtimeSettings');
const {
  resolvePingOneUserForLookup,
  phoneLast4Matches,
} = require('../services/pingOneUserLookupService');

// Get system statistics
router.get('/stats', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const users = dataStore.getAllUsers();
    const accounts = dataStore.getAllAccounts();
    const transactions = dataStore.getAllTransactions();
    const activityLogs = dataStore.getAllActivityLogs();

    const stats = {
      totalUsers: users.length,
      activeUsers: users.filter(user => user.isActive).length,
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(account => account.isActive).length,
      totalTransactions: transactions.length,
      totalActivityLogs: activityLogs.length,
      totalBalance: accounts.reduce((sum, account) => sum + account.balance, 0),
      averageBalance: accounts.length > 0 ? accounts.reduce((sum, account) => sum + account.balance, 0) / accounts.length : 0
    };

    res.json({ stats });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const TX_LOOKUP_LIMIT = 100;

/**
 * POST body: { username, phoneLast4 } — verify last 4 digits against PingOne mobile and/or local phone,
 * return merged profile (PingOne where available), accounts with balances, and recent transactions.
 */
router.post('/transactions/lookup', requireAdmin, requireScopes(['banking:admin']), async (req, res) => {
  try {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const phoneLast4 = typeof req.body.phoneLast4 === 'string' ? req.body.phoneLast4.trim() : '';
    if (!username || !phoneLast4) {
      return res.status(400).json({ error: 'username and phoneLast4 are required' });
    }
    const want = phoneLast4.replace(/\D/g, '').slice(-4);
    if (want.length !== 4) {
      return res.status(400).json({ error: 'phoneLast4 must be 4 digits' });
    }

    const users = dataStore.getAllUsers();
    const user = users.find((u) => String(u.username || '').toLowerCase() === username.toLowerCase());
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let pingOneResolved;
    try {
      pingOneResolved = await resolvePingOneUserForLookup(user);
    } catch (e) {
      console.warn('Admin lookup: PingOne resolve error:', e.message);
      pingOneResolved = { user: null, matchedBy: null, error: e.message || 'lookup_failed' };
    }

    const p1 = pingOneResolved?.user || null;
    if (!phoneLast4Matches(want, user, p1)) {
      return res.status(403).json({ error: 'Phone verification failed' });
    }

    const firstName = p1?.givenName || user.firstName || '';
    const lastName = p1?.familyName || user.lastName || '';
    const fullName = (p1?.fullName || `${firstName} ${lastName}`.trim() || user.username).trim();
    const email = p1?.email || user.email || '';
    const phoneOnRecord = p1?.mobilePhone || user.phone || '';

    let transactions = dataStore.getTransactionsByUserId(user.id);
    transactions = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const slice = transactions.slice(0, TX_LOOKUP_LIMIT);

    const enriched = slice.map((tx) => {
      const fromAccount = tx.fromAccountId ? dataStore.getAccountById(tx.fromAccountId) : null;
      const toAccount = tx.toAccountId ? dataStore.getAccountById(tx.toAccountId) : null;
      let accountInfo = '—';
      if (fromAccount) {
        accountInfo = `${fromAccount.accountType} - ${fromAccount.accountNumber}`;
      } else if (toAccount) {
        accountInfo = `${toAccount.accountType} - ${toAccount.accountNumber}`;
      }
      return {
        ...tx,
        accountInfo,
        performedBy: fullName || user.username,
      };
    });

    const accounts = dataStore.getAccountsByUserId(user.id).map((a) => ({
      id: a.id,
      accountNumber: a.accountNumber,
      accountType: a.accountType,
      balance: a.balance,
      currency: a.currency || 'USD',
      isActive: a.isActive !== false,
    }));

    const pingOnePayload = p1
      ? {
          linked: true,
          userId: p1.id,
          matchedBy: pingOneResolved.matchedBy || null,
          lifecycleStatus: p1.lifecycleStatus || '',
          enabled: p1.enabled,
        }
      : {
          linked: false,
          reason: pingOneResolved?.error || 'not_found',
        };

    res.json({
      user: {
        id: user.id,
        username: user.username,
        firstName,
        lastName,
        fullName,
        email,
        phone: phoneOnRecord,
        phoneOnRecord,
      },
      pingOne: pingOnePayload,
      accounts,
      transactions: enriched,
      count: enriched.length,
      totalTransactions: transactions.length,
    });
  } catch (error) {
    console.error('Admin transactions lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all activity logs
router.get('/activity', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const { page = 1, limit = 50, username, action, startDate, endDate } = req.query;
    
    let logs = dataStore.getAllActivityLogs();

    // Filter by username
    if (username) {
      logs = logs.filter(log => log.username && log.username.toLowerCase().includes(username.toLowerCase()));
    }

    // Filter by action
    if (action) {
      logs = logs.filter(log => log.action && log.action.toLowerCase().includes(action.toLowerCase()));
    }

    // Filter by date range
    if (startDate) {
      const start = new Date(startDate);
      logs = logs.filter(log => new Date(log.timestamp) >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      logs = logs.filter(log => new Date(log.timestamp) <= end);
    }

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    const totalPages = Math.ceil(logs.length / limit);

    res.json({
      logs: paginatedLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalLogs: logs.length,
        logsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activity logs by username
router.get('/activity/user/:username', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const { username } = req.params;
    const { page = 1, limit = 50 } = req.query;

    let logs = dataStore.getActivityLogsByUsername(username);

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    const totalPages = Math.ceil(logs.length / limit);

    res.json({
      logs: paginatedLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalLogs: logs.length,
        logsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get user activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activity logs by user ID
router.get('/activity/userid/:userId', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    let logs = dataStore.getActivityLogsByUserId(userId);

    // Sort by timestamp (newest first)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedLogs = logs.slice(startIndex, endIndex);

    const totalPages = Math.ceil(logs.length / limit);

    res.json({
      logs: paginatedLogs,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalLogs: logs.length,
        logsPerPage: parseInt(limit)
      }
    });

  } catch (error) {
    console.error('Get user ID activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent activity (last 24 hours)
router.get('/activity/recent', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
    
    const logs = dataStore.getAllActivityLogs()
      .filter(log => new Date(log.timestamp) >= cutoffTime)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ logs });

  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get activity summary by action type
router.get('/activity/summary', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const logs = dataStore.getAllActivityLogs();
    
    const summary = logs.reduce((acc, log) => {
      const action = log.action || 'UNKNOWN';
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {});

    // Convert to array and sort by count
    const summaryArray = Object.entries(summary)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    res.json({ summary: summaryArray });

  } catch (error) {
    console.error('Get activity summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user activity summary
router.get('/activity/users/summary', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const logs = dataStore.getAllActivityLogs();
    
    const userSummary = logs.reduce((acc, log) => {
      const username = log.username || 'Unknown';
      if (!acc[username]) {
        acc[username] = {
          username,
          totalActions: 0,
          actions: {}
        };
      }
      
      acc[username].totalActions++;
      const action = log.action || 'UNKNOWN';
      acc[username].actions[action] = (acc[username].actions[action] || 0) + 1;
      
      return acc;
    }, {});

    // Convert to array and sort by total actions
    const summaryArray = Object.values(userSummary)
      .sort((a, b) => b.totalActions - a.totalActions);

    res.json({ userSummary: summaryArray });

  } catch (error) {
    console.error('Get user activity summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear old activity logs (older than specified days)
router.delete('/activity/clear', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000));
    
    const logs = dataStore.getAllActivityLogs();
    const logsToKeep = logs.filter(log => new Date(log.timestamp) >= cutoffDate);
    const logsToDelete = logs.filter(log => new Date(log.timestamp) < cutoffDate);

    // Clear all logs and restore only the ones to keep
    dataStore.activityLogs.clear();
    logsToKeep.forEach(log => {
      dataStore.activityLogs.set(log.id, log);
    });

    res.json({ 
      message: `Cleared ${logsToDelete.length} old activity logs`,
      deletedCount: logsToDelete.length,
      remainingCount: logsToKeep.length
    });

  } catch (error) {
    console.error('Clear activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export activity logs (CSV format)
router.get('/activity/export', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const logs = dataStore.getAllActivityLogs()
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Create CSV content
    const csvHeaders = 'ID,User ID,Username,Action,Endpoint,IP Address,User Agent,Response Status,Duration (ms),Timestamp\n';
    const csvRows = logs.map(log => {
      return [
        log.id,
        log.userId || '',
        log.username || '',
        log.action || '',
        log.endpoint || '',
        log.ipAddress || '',
        `"${(log.userAgent || '').replace(/"/g, '""')}"`,
        log.responseStatus || '',
        log.duration || '',
        log.timestamp
      ].join(',');
    }).join('\n');

    const csvContent = csvHeaders + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="activity_logs_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csvContent);

  } catch (error) {
    console.error('Export activity logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Runtime Settings ─────────────────────────────────────────────────────────

// GET /api/admin/settings — return current live settings
router.get('/settings', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  res.json({
    settings: runtimeSettings.getAll(),
    history: runtimeSettings.getHistory(),
  });
});

// PUT /api/admin/settings — update one or more settings at runtime
router.put('/settings', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const changedBy = req.user?.email || req.user?.username || 'admin';
    const result = runtimeSettings.update(req.body, changedBy);

    if (!result.updated) {
      return res.status(400).json({ error: 'No valid settings fields provided.' });
    }

    console.log(`[Settings] Updated by ${changedBy}:`, req.body);
    res.json({ message: 'Settings updated successfully.', settings: result.settings });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── OAuth verbose log (admin UI; file / KV / memory — see oauthVerboseLogStore) ──

const oauthVerboseLogStore = require('../services/oauthVerboseLogStore');

router.get('/oauth-debug-log', requireAdmin, requireScopes(['banking:admin']), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), oauthVerboseLogStore.MAX_LINES);
    const { lines, backend } = await oauthVerboseLogStore.getRecentLines(limit);
    res.json({
      lines,
      backend,
      hint:
        backend === 'memory'
          ? 'Logs are in server memory only (typical on Vercel without KV). Connect Vercel KV for shared durable logs across instances.'
          : backend === 'kv'
            ? 'Logs stored in Vercel KV (shared across serverless instances).'
            : 'Logs stored under data/logs/oauth-verbose.log on the API host.',
    });
  } catch (error) {
    console.error('oauth-debug-log read error:', error);
    res.status(500).json({ error: 'log_read_failed', message: error.message });
  }
});

router.delete('/oauth-debug-log', requireAdmin, requireScopes(['banking:admin']), async (req, res) => {
  try {
    await oauthVerboseLogStore.clear();
    res.json({ ok: true, message: 'OAuth verbose log cleared.' });
  } catch (error) {
    console.error('oauth-debug-log clear error:', error);
    res.status(500).json({ error: 'log_clear_failed', message: error.message });
  }
});

/**
 * Build JSON snapshot of in-memory banking data (Dates → ISO strings).
 */
function buildSerializableBootstrapSnapshot() {
  const snap = dataStore.getSnapshot();
  return JSON.parse(
    JSON.stringify(snap, (_key, value) => (value instanceof Date ? value.toISOString() : value))
  );
}

/**
 * GET downloadable seed file for committing as data/bootstrapData.json.
 */
router.get('/bootstrap/export', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const body = buildSerializableBootstrapSnapshot();
    const json = `${JSON.stringify(body, null, 2)}\n`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="bootstrapData.json"');
    res.send(json);
  } catch (error) {
    console.error('bootstrap export error:', error);
    res.status(500).json({ error: 'bootstrap_export_failed', message: error.message });
  }
});

/**
 * POST writes seed file on disk (local dev only — never on Vercel).
 */
router.post('/bootstrap/export', requireAdmin, requireScopes(['banking:admin']), async (req, res) => {
  if (process.env.VERCEL) {
    return res.status(403).json({
      error: 'write_disabled',
      message: 'Cannot write seed file on Vercel (read-only filesystem). Use GET to download JSON.',
    });
  }
  const allowWrite =
    process.env.NODE_ENV !== 'production' || process.env.ALLOW_BOOTSTRAP_EXPORT_WRITE === 'true';
  if (!allowWrite) {
    return res.status(403).json({
      error: 'write_disabled',
      message:
        'Server file write is disabled in production unless ALLOW_BOOTSTRAP_EXPORT_WRITE=true. Use GET to download JSON.',
    });
  }
  try {
    const cwd = path.resolve(process.cwd());
    const rel = process.env.BANKING_BOOTSTRAP_FILE || path.join('data', 'bootstrapData.json');
    const outPath = path.resolve(cwd, rel);
    const relToCwd = path.relative(cwd, outPath);
    if (relToCwd.startsWith('..') || path.isAbsolute(relToCwd)) {
      return res.status(400).json({ error: 'invalid_path', message: 'Path must stay within the API project directory.' });
    }
    const body = buildSerializableBootstrapSnapshot();
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
    res.json({ ok: true, path: outPath });
  } catch (error) {
    console.error('bootstrap write error:', error);
    res.status(500).json({ error: 'bootstrap_write_failed', message: error.message });
  }
});

/**
 * GET /banking/lookup?q= — find accounts whose number/id matches (substring + digit-only match).
 * Returns accounts and recent transactions touching those accounts (newest first).
 */
router.get('/banking/lookup', requireAdmin, requireScopes(['banking:admin']), (req, res) => {
  try {
    const raw = String(req.query.q || '').trim();
    if (!raw) {
      return res.status(400).json({ error: 'invalid_query', message: 'Query parameter q is required.' });
    }
    const qLower = raw.toLowerCase();
    const qDigits = raw.replace(/\D/g, '');
    const allAccounts = dataStore.getAllAccounts();
    const accounts = allAccounts.filter((a) => {
      if (String(a.accountNumber).toLowerCase().includes(qLower)) return true;
      if (String(a.id).toLowerCase().includes(qLower)) return true;
      if (qDigits.length > 0) {
        const acctDigits = String(a.accountNumber).replace(/\D/g, '');
        if (acctDigits.includes(qDigits)) return true;
      }
      return false;
    });

    const txns = [];
    for (const acct of accounts) {
      for (const t of dataStore.getTransactionsByAccountId(acct.id)) {
        txns.push({
          ...t,
          _accountId: acct.id,
          _accountNumber: acct.accountNumber,
        });
      }
    }
    txns.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      accounts,
      transactions: txns.slice(0, 200),
    });
  } catch (error) {
    console.error('banking lookup error:', error);
    res.status(500).json({ error: 'lookup_failed', message: error.message });
  }
});

/**
 * POST /banking/accounts/:accountId/seed-charges — add synthetic withdrawal rows (demo / QA).
 */
router.post('/banking/accounts/:accountId/seed-charges', requireAdmin, requireScopes(['banking:admin']), async (req, res) => {
  try {
    const account = dataStore.getAccountById(req.params.accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    const uid = account.userId;
    const samples = [
      { amount: 12.99, description: 'Card purchase — Retail' },
      { amount: 45.0, description: 'Debit — Fuel' },
      { amount: 8.25, description: 'Foreign transaction fee' },
      { amount: 2.5, description: 'ATM surcharge' },
    ];
    const created = [];
    for (const s of samples) {
      const t = await dataStore.createTransaction({
        fromAccountId: account.id,
        toAccountId: null,
        amount: s.amount,
        type: 'withdrawal',
        description: s.description,
        userId: uid,
        status: 'completed',
        performedBy: 'Admin seed',
        clientType: 'admin',
        tokenType: 'oauth',
      });
      await dataStore.updateAccountBalance(account.id, -s.amount);
      created.push(t);
    }
    const refreshed = dataStore.getAccountById(account.id);
    res.status(201).json({
      message: 'Fake bank charges added to account history',
      transactions: created,
      account: refreshed,
    });
  } catch (error) {
    console.error('seed-charges error:', error);
    res.status(500).json({ error: 'seed_failed', message: error.message });
  }
});

module.exports = router;
