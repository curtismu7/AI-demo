'use strict';

const path = require('path');
const fs = require('fs');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

/**
 * Per-vertical retail data store — genuine retail objects (orders, rewards,
 * wishlist) keyed by userId, NOT relabeled banking accounts. Deep clone per user.
 */
function createRetailStore() {
  const byUser = new Map();
  function get(userId) {
    if (!byUser.has(userId)) byUser.set(userId, structuredClone(SEED));
    return byUser.get(userId);
  }
  let seq = 0;
  function checkout(userId, { product, amount }) {
    const data = get(userId);
    seq += 1;
    const order = { id: `ord-new-${seq}`, product, amount, status: 'Processing', date: '2026-05-31' };
    data.orders.push(order);
    return order;
  }
  return { get, checkout };
}

module.exports = { createRetailStore };
