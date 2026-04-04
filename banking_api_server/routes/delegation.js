'use strict';

const express = require('express');
const router  = express.Router();
const {
  grantDelegation,
  revokeDelegation,
  listDelegations,
  getDelegationHistory,
} = require('../services/delegationService');

// GET /api/delegation/history — full history for authenticated user (must come before '/:id' patterns)
router.get('/history', async (req, res) => {
  try {
    const history = await getDelegationHistory(req.user.id);
    res.json({ history });
  } catch (err) {
    console.error('[delegation] GET /history error:', err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// GET /api/delegation — list active delegations for authenticated user
router.get('/', async (req, res) => {
  try {
    const delegations = await listDelegations(req.user.id);
    res.json({ delegations });
  } catch (err) {
    console.error('[delegation] GET / error:', err.message);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/delegation — grant a new delegation
router.post('/', async (req, res) => {
  const { delegateEmail, scopes } = req.body || {};
  const delegatorEmail = req.user.email || req.user.username || '';
  const result = await grantDelegation({
    delegatorUserId: req.user.id,
    delegatorEmail,
    delegateEmail,
    scopes: Array.isArray(scopes) ? scopes : [],
  });
  if (!result.ok) {
    const statusMap = {
      validation_error:    400,
      self_delegation:     400,
      duplicate_delegation: 409,
      provisioning_failed: 502,
    };
    return res.status(statusMap[result.error] || 400).json(result);
  }
  res.status(201).json(result);
});

// DELETE /api/delegation/:id — revoke a delegation
router.delete('/:id', async (req, res) => {
  const result = await revokeDelegation(req.params.id, req.user.id);
  if (!result.ok) {
    return res.status(404).json(result);
  }
  res.json(result);
});

module.exports = router;
