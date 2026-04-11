/**
 * apiCallTracker.js
 *
 * API routes for tracking and retrieving API call information for educational purposes.
 */

const express = require('express');
const { trackApiCall, getApiCalls, clearApiCalls, getApiCallStats } = require('../services/apiCallTrackerService');

const router = express.Router();

/**
 * GET /api/api-calls
 * Retrieve tracked API calls for a session
 */
router.get('/', (req, res) => {
  try {
    const sessionId = req.session?.id || req.query.sessionId || 'default';
    const limit = parseInt(req.query.limit) || 50;

    const calls = getApiCalls(sessionId, limit);
    const stats = getApiCallStats(sessionId);

    res.json({
      success: true,
      sessionId,
      stats,
      calls
    });
  } catch (error) {
    console.error('[apiCallTracker] Error retrieving calls:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/api-calls
 * Clear tracked API calls for a session
 */
router.delete('/', (req, res) => {
  try {
    const sessionId = req.session?.id || req.query.sessionId || 'default';
    clearApiCalls(sessionId);

    res.json({
      success: true,
      sessionId,
      message: 'API calls cleared'
    });
  } catch (error) {
    console.error('[apiCallTracker] Error clearing calls:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/api-calls
 * Track an API call (internal use)
 */
router.post('/', (req, res) => {
  try {
    const sessionId = req.session?.id || req.body.sessionId || 'default';
    const call = trackApiCall({
      ...req.body,
      sessionId
    });

    res.json({
      success: true,
      call
    });
  } catch (error) {
    console.error('[apiCallTracker] Error tracking call:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
