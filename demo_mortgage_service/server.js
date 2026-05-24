'use strict';

/**
 * banking_mortgage_service — Phase 266 Path A backend.
 *
 * A minimal API-key-gated service that returns a single dummy mortgage record.
 * The MCP gateway calls this service on the api_key disposition: it sends
 * `X-API-Key: <key>` (no OAuth bearer) and gets the mortgage payload back.
 *
 * Auth model: shared secret in `MORTGAGE_SERVICE_API_KEY`. No JWT, no aud check.
 * This is intentionally the simplest possible service — the demo point is
 * "the gateway swapped the user's bearer for a service API key and called a
 * different backend."
 *
 * Port: 8082 (default; override with MORTGAGE_SERVICE_PORT)
 */

require('dotenv').config();
const express = require('express');

const PORT = parseInt(process.env.MORTGAGE_SERVICE_PORT, 10) || 8082;
const HOST = process.env.MORTGAGE_SERVICE_HOST || '127.0.0.1';
const API_KEY = process.env.MORTGAGE_SERVICE_API_KEY || 'demo-mortgage-key-0000';

// Startup env validation
const DEFAULT_MORTGAGE_KEY = 'demo-mortgage-key-0000';
if (API_KEY === DEFAULT_MORTGAGE_KEY) {
  console.warn(
    '[demo-mortgage-service] WARNING: MORTGAGE_SERVICE_API_KEY is not set — ' +
    'using the insecure default key. Set MORTGAGE_SERVICE_API_KEY in ' +
    'demo_api_server/.env for a real deployment.'
  );
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// Health — unauthenticated, used by run-demo.sh status checks.
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'banking_mortgage_service',
    port: PORT,
    apiKeyLast4: API_KEY.length >= 4 ? API_KEY.slice(-4) : 'XXXX',
  });
});

// Middleware: X-API-Key gate. Constant-time compare via Buffer to avoid
// trivial timing attacks (the demo doesn't need this, but cheap to do).
function requireApiKey(req, res, next) {
  const presented = req.headers['x-api-key'];
  if (!presented || typeof presented !== 'string') {
    return res.status(401).json({ error: 'api_key_missing', message: 'X-API-Key header required' });
  }
  // Constant-time compare
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(API_KEY, 'utf8');
  if (a.length !== b.length) {
    return res.status(401).json({ error: 'api_key_invalid' });
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) {
    return res.status(401).json({ error: 'api_key_invalid' });
  }
  next();
}

// GET /mortgage — banking vertical: home loan record.
app.get('/mortgage', requireApiKey, (_req, res) => {
  res.json({
    mortgage: {
      id: 'mtg-001',
      propertyAddress: '1234 Maple Street, Springfield, IL 62704',
      loanAmount: 425000.00,
      currentBalance: 387542.18,
      interestRate: 6.125,
      monthlyPayment: 2582.43,
      nextPaymentDate: '2026-06-01',
      term: '30-year fixed',
      originationDate: '2023-04-15',
      currency: 'USD',
    },
    source: 'banking_mortgage_service',
    authMechanism: 'X-API-Key (shared secret)',
    note: 'This data was returned because the gateway presented a valid service API key. No OAuth bearer was involved on this hop.',
  });
});

// GET /retail — Great Buy vertical: large purchase record.
app.get('/retail', requireApiKey, (_req, res) => {
  res.json({
    largePurchase: {
      orderId: 'ORD-20260501-8821',
      product: 'Samsung 65" QLED TV',
      sku: 'BB-65QLED',
      category: 'TV',
      amount: 1299.00,
      currency: 'USD',
      status: 'Shipped',
      estimatedDelivery: '2026-06-03',
      rewardsPointsEarned: 1299,
      retailer: 'Great Buy',
    },
    source: 'banking_mortgage_service',
    authMechanism: 'X-API-Key (shared secret)',
    note: 'This data was returned because the gateway presented a valid service API key. No OAuth bearer was involved on this hop.',
  });
});

// GET /healthcare — CareConnect vertical: health record summary.
app.get('/healthcare', requireApiKey, (_req, res) => {
  res.json({
    healthRecord: {
      recordId: 'REC-2026-04881',
      recordType: 'Annual Wellness Visit',
      provider: 'Dr. Sarah Mitchell, MD',
      facility: 'Springfield Family Health',
      visitDate: '2026-04-18',
      coveredAmount: 380.00,
      copay: 20.00,
      currency: 'USD',
      status: 'Processed',
      coveragePlan: 'BlueShield PPO Gold',
    },
    source: 'banking_mortgage_service',
    authMechanism: 'X-API-Key (shared secret)',
    note: 'This data was returned because the gateway presented a valid service API key. No OAuth bearer was involved on this hop.',
  });
});

// GET /gear — Super Sports vertical: gear order record.
app.get('/gear', requireApiKey, (_req, res) => {
  res.json({
    gearOrder: {
      orderId: 'SS-20260419-4471',
      item: 'Garmin Fenix 8 GPS Watch',
      category: 'Wearable',
      amount: 799.00,
      currency: 'USD',
      status: 'Delivered',
      deliveredDate: '2026-04-22',
      loyaltyPointsEarned: 1598,
      memberTier: 'Elite Member',
    },
    source: 'banking_mortgage_service',
    authMechanism: 'X-API-Key (shared secret)',
    note: 'This data was returned because the gateway presented a valid service API key. No OAuth bearer was involved on this hop.',
  });
});

// GET /expense — WX Workforce vertical: expense report record.
app.get('/expense', requireApiKey, (_req, res) => {
  res.json({
    expenseReport: {
      reportId: 'EXP-2026-00312',
      category: 'Travel & Accommodation',
      description: 'Q2 Sales Summit — Chicago, IL',
      amount: 1847.50,
      currency: 'USD',
      submittedDate: '2026-05-02',
      status: 'Approved',
      approver: 'Jordan Lee (Finance)',
      reimbursementDate: '2026-05-15',
    },
    source: 'banking_mortgage_service',
    authMechanism: 'X-API-Key (shared secret)',
    note: 'This data was returned because the gateway presented a valid service API key. No OAuth bearer was involved on this hop.',
  });
});

// 404 for anything else.
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`[demo-mortgage-service] Ready on :${PORT}`);
    console.log(`[demo-mortgage-service] API key (last 4): ...${API_KEY.length >= 4 ? API_KEY.slice(-4) : 'XXXX'}`);
  });

  // Graceful shutdown — drain in-flight requests before exit
  const shutdown = (signal) => {
    console.log(`[demo-mortgage-service] ${signal} received — shutting down`);
    server.close(() => {
      console.log('[demo-mortgage-service] HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[demo-mortgage-service] Drain timeout — forcing exit');
      process.exit(1);
    }, 5000);
  };
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
