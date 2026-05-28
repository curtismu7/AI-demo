'use strict';

/**
 * Expected primary accountType for each vertical's seed data.
 * Used to detect stale/wrong-vertical accounts and trigger a reseed.
 * Comparison must be case-insensitive — provisionDemoAccounts uses lowercase
 * 'checking'/'savings' while the banking seed file uses 'CHECKING'/'SAVINGS'.
 */
const VERTICAL_PRIMARY_TYPE = {
  banking:          'CHECKING',
  healthcare:       'Primary Care',
  retail:           'Rewards Points',
  'sporting-goods': 'Pro Member',
  workforce:        'PTO Balance',
};

module.exports = { VERTICAL_PRIMARY_TYPE };
