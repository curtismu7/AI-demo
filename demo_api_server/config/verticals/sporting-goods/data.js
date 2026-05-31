'use strict';

const path = require('path');
const fs = require('fs');

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));

/**
 * Per-vertical sporting-goods data store — orders, rentals (a sporting-goods-only
 * domain), loyalty — keyed by userId, NOT relabeled banking accounts. Deep clone per user.
 */
function createSportingGoodsStore() {
  const byUser = new Map();
  function get(userId) {
    if (!byUser.has(userId)) byUser.set(userId, structuredClone(SEED));
    return byUser.get(userId);
  }
  function extendRental(userId, { rentalId }) {
    const data = get(userId);
    const rental = data.rentals.find((r) => r.id === rentalId);
    if (!rental) return null;
    rental.status = 'Extended';
    return rental;
  }
  return { get, extendRental };
}

module.exports = { createSportingGoodsStore };
