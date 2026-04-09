# Transaction Persistence Bug - Root Cause: Missing Redis Persistence for Transactions

## THE BUG FOUND ✅

**Location:** `banking_api_server/routes/transactions.js` (line 233-245, transfer response not saving transaction snapshot)
**Location:** `banking_api_server/routes/accounts.js` (line 145, 182 - account snapshot IS saved)
**Missing:** Transaction snapshot persistence to Redis/KV

## Why Transfer/Withdraw Don't Persist

### Current Flow (BROKEN ❌)

1. User submits Transfer ($200) from Checking to Savings
2. API creates transaction and updates balance in in-memory dataStore
3. accountSnapshot IS saved to Redis with new balances ✅
4. Frontend receives 201 response
5. Frontend calls fetchUserData() → GET /api/transactions/my
6. **If request lands on SAME Lambda:** Transactions visible (temporary success)
7. **If page refresh OR different Lambda:** New instance loads accounts from Redis ✅ but transactions from empty store ❌
8. Transaction disappears!

### Why Deposit Different?

Deposit appears to work because:
- User tends to stay on same page without refresh
- Demo mode has both account + transaction in local state (frontend-only, survives refresh within browser)
- Accounts ARE being restored from Redis, so balance changes appear persistent
- But the actual transaction record is lost

### Account Snapshot Format (Saved to Redis)

From `accounts.js` line ~143:
```javascript
const snapshot = userAccounts.map(a => ({
  id: a.id,
  accountType: a.accountType,
  accountNumber: a.accountNumber,
  name: a.name || '',
  balance: a.balance,  // ← Updated balance is saved!
  currency: a.currency || 'USD',
  isActive: true,
}));
await demoScenarioStore.save(req.user.id, { accountSnapshot: snapshot });
```

### Transaction Snapshot Format (NOT Saved)

From `transactions.js` response line ~420:
```javascript
res.status(201).json({
  message: 'Transfer completed successfully',
  withdrawalTransaction,
  depositTransaction,
  // ← NO PERSISTENCE!
});
```

**There's NO code to save transaction snapshot to Redis!**

## The Fix

Add transaction snapshot persistence in `transactions.js` POST endpoint:

After creating transactions and updating balances, add:
```javascript
// Persist transaction snapshot for serverless cold-start recovery
const snapshot = { transactionSnapshot: [withdrawalTransaction, depositTransaction] };
try {
  await demoScenarioStore.save(req.user.id, snapshot);
} catch (e) {
  console.warn('[transactions] scenario save failed:', e.message);
}
```

And on re-hydration (line ~20), restore:
```javascript
if (!Array.isArray(scenario.transactionSnapshot) || scenario.transactionSnapshot.length === 0) return;
for (const snap of scenario.transactionSnapshot) {
  if (!dataStore.getTransactionById(snap.id)) {
    await dataStore.createTransaction(snap);
  }
}
```

## Why All Three Types Affected

- **Deposit:** Creates TOAccountId transaction → MISSING persistence
- **Withdrawal:** Creates FROMAccountId transaction → MISSING persistence  
- **Transfer:** Creates TWO transactions (withdrawal + deposit) → MISSING persistence

All three create transactions that aren't saved to Redis.

## Why Symptoms Vary

**Apparent**: "Deposit works, Transfer/Withdraw don't"
**Truth**: All three don't persist beyond Lambda lifetime / page refresh

You might see Deposit appear to work because:
1. Account balance IS persisted (looks like transaction succeeded)
2. You haven't done a page refresh yet (frontend state still has transaction)
3. When you DO refresh and land on a different Lambda, all three disappear

## Implementation Tasks

### 1. Add Transaction Snapshot Persistence

**File:** `banking_api_server/routes/transactions.js`

After line 430 (POST /:id success response for transfers):
```javascript
// Persist transaction snapshot to Redis for cold-start recovery
const txSnapshot = [withdrawalTransaction, depositTransaction];
try {
  const existing = await demoScenarioStore.load(req.user.id);
  const updated = { ...(existing || {}), transactionSnapshot: txSnapshot };
  await demoScenarioStore.save(req.user.id, updated);
} catch (e) {
  console.warn('[transactions] snapshot save error:', e.message);
}
```

And for single transactions (after line 455):
```javascript
// Persist transaction snapshot
try {
  const existing = await demoScenarioStore.load(req.user.id);
  const updated = { ...(existing || {}), transactionSnapshot: [transaction] };
  await demoScenarioStore.save(req.user.id, updated);
} catch (e) {
  console.warn('[transactions] snapshot save error:', e.message);
}
```

### 2. Add Transaction SnapshotRecovery

**File:** `banking_api_server/routes/transactions.js`

Before line ~20, add restore function:
```javascript
async function restoreTransactionsFromSnapshot(userId) {
  try {
    const scenario = await demoScenarioStore.load(userId);
    if (!Array.isArray(scenario.transactionSnapshot) || scenario.transactionSnapshot.length === 0) return;
    for (const snap of scenario.transactionSnapshot) {
      if (!dataStore.getTransactionById(snap.id)) {
        await dataStore.createTransaction(snap);
      }
    }
  } catch (e) {
    console.warn('[transactions] restoreTransactionsFromSnapshot failed:', e.message);
  }
}
```

And call it in GET /my endpoint (line 61, alongside restoreAccountsFromSnapshot):
```javascript
await restoreTransactionsFromSnapshot(req.user.id);
```

### 3. Test Plan

- [ ] Make a deposit of $100 → refresh page → should persist
- [ ] Make a transfer of $200 → refresh page → should persist
- [ ] Make a withdrawal of $50 → refresh page → should persist
- [ ] Verify transactions list shows all three types across page refreshes
- [ ] Verify account balances match transaction history

## Fixes Needed Before Implementation

1. **Handle snapshot merging:** When multiple transaction types occur in same session:
   - Don't overwrite transactionSnapshot, append to it
   - Or use a different key per-transaction timestamp
   
2. **Handle cascade deletes:** If user clears transactions via admin:
   - Clear Redis snapshot too
   - Add DELETE endpoint that clears transactionSnapshot

3. **Performance:** Store only recent transactions in Redis:
   - Keep most recent 20-50 transactions only
   - Full history stays in data store within session

## Verification Commands

```bash
#1. Check if Redis contains account snapshots (should see accountSnapshot)
redis-cli KEYS "banking:demo-scenario:*"
redis-cli GET "banking:demo-scenario:user-123"  # Should have accountSnapshot

# 2. After fix, should have transactionSnapshot too
redis-cli GET "banking:demo-scenario:user-123"  # Should have transactionSnapshot

# 3. Test transaction persistence
curl -X POST /api/transactions ...  # Create transfer
curl -X GET /api/transactions/my   # Should see it
# (Simulate Lambda cold-start by restarting server)
curl -X GET /api/transactions/my   # NEW: Should still see it!
```

## Impact

- **Severity:** HIGH - Customers lose transaction history on page refresh
- **Scope:** All three transaction types (deposit, withdraw, transfer)
- **Affected:** Only Vercel/serverless (single-process dev works because same Lambda instance)
- **Fix Complexity:** MEDIUM (existing snapshot pattern, just needs transaction addition)
- **Testing:** EASY (manual refresh + network inspection)
