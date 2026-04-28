'use strict';

/**
 * HITL notifier — sends push notifications to the user when approval is needed.
 *
 * Supported modes (HITL_NOTIFY_MODE):
 *   ciba   — calls PingOne CIBA backchannel auth to trigger push/email
 *   email  — sends an email via SMTP (or BFF email service)
 *   log    — dev/test: just logs to console, no external call
 */

const axios = require('axios');

const NOTIFY_MODE = process.env.HITL_NOTIFY_MODE || 'log';
const CIBA_ENDPOINT = process.env.PINGONE_CIBA_ENDPOINT || '';
const CIBA_CLIENT_ID = process.env.HITL_CLIENT_ID || '';
const CIBA_CLIENT_SECRET = process.env.HITL_CLIENT_SECRET || '';
const HITL_DASHBOARD_URL = process.env.HITL_DASHBOARD_URL || 'http://localhost:3000/dashboard/approve';

/**
 * Send HITL notification for a challenge.
 * @param {object} challenge - from challengeStore
 * @param {string} userEmail
 */
async function notifyUser(challenge, userEmail) {
  const approvalUrl = `${HITL_DASHBOARD_URL}?challengeId=${challenge.id}`;
  const message = _buildMessage(challenge, approvalUrl);

  if (NOTIFY_MODE === 'ciba') {
    return _notifyViaCiba(challenge, userEmail, message);
  }
  if (NOTIFY_MODE === 'email') {
    return _notifyViaEmail(challenge, userEmail, message, approvalUrl);
  }

  // log mode (default for dev)
  console.log(`[HITL] Approval needed — challengeId: ${challenge.id}`);
  console.log(`[HITL] Tool: ${challenge.tool}, User: ${userEmail}`);
  console.log(`[HITL] Approval URL: ${approvalUrl}`);
}

function _buildMessage(challenge, approvalUrl) {
  const toolLabel = challenge.tool || 'an action';
  const ctx = challenge.context || {};
  const detail = ctx.amount ? ` ($${ctx.amount})` : '';
  return `AI agent is requesting approval to call ${toolLabel}${detail}. Review and approve: ${approvalUrl}`;
}

async function _notifyViaCiba(challenge, userEmail, message) {
  if (!CIBA_ENDPOINT || !CIBA_CLIENT_ID) {
    console.warn('[HITL] CIBA not configured — falling back to log');
    console.log('[HITL] Approval needed:', challenge.id, 'for', userEmail);
    return;
  }

  const credentials = Buffer.from(`${CIBA_CLIENT_ID}:${CIBA_CLIENT_SECRET}`).toString('base64');
  const params = new URLSearchParams({
    login_hint: userEmail,
    scope: 'openid',
    binding_message: message.slice(0, 200),
  });

  try {
    await axios.post(CIBA_ENDPOINT, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`,
      },
      timeout: 10_000,
    });
    console.log(`[HITL] CIBA notification sent for challenge ${challenge.id}`);
  } catch (err) {
    console.error('[HITL] CIBA notification failed:', err.message);
    throw err;
  }
}

async function _notifyViaEmail(_challenge, userEmail, _message, approvalUrl) {
  // Calls BFF email endpoint — BFF has the SMTP credentials
  const bffUrl = process.env.BANKING_API_BASE_URL || 'http://localhost:3001';
  try {
    await axios.post(`${bffUrl}/api/internal/hitl-notify`, {
      email: userEmail,
      approvalUrl,
    }, { timeout: 10_000 });
  } catch (err) {
    console.error('[HITL] Email notification failed:', err.message);
    throw err;
  }
}

module.exports = { notifyUser };
