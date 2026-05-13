'use strict';

/**
 * Public entry point for the portable encrypted credential vault (Phase 269).
 *
 * Task 1 (this commit) wires the error classes and exports a stub for
 * openVault/createVault. Task 2 replaces the stubs with the full handle
 * implementation (read/set/delete/list/rotate/save/close).
 */

const errors = require('./errors');

async function openVault() {
  throw new Error('vault: not yet implemented — Task 2');
}

async function createVault() {
  throw new Error('vault: not yet implemented — Task 2');
}

module.exports = {
  openVault,
  createVault,
  ...errors,
};
