'use strict';

const path = require('path');
const fs = require('fs');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

/**
 * Per-vertical workforce data store — pto, benefits, expenses — keyed by userId,
 * NOT relabeled banking accounts. Deep clone per user.
 */
function createWorkforceStore() {
  const byUser = new Map();
  function get(userId) {
    if (!byUser.has(userId)) byUser.set(userId, structuredClone(SEED));
    return byUser.get(userId);
  }
  let seq = 0;
  function submitExpense(userId, { category, amount }) {
    const data = get(userId);
    seq += 1;
    const exp = { id: `exp-new-${seq}`, category, amount, status: 'Submitted', submittedDate: '2026-05-31', description: category };
    data.expenses.push(exp);
    return exp;
  }
  function requestTimeOff(userId, { days }) {
    const data = get(userId);
    if (data.pto.balance < days) return { error: `insufficient PTO: ${data.pto.balance} day(s) available` };
    data.pto.balance -= days;
    return { days, remaining: data.pto.balance };
  }
  return { get, submitExpense, requestTimeOff };
}

module.exports = { createWorkforceStore };
