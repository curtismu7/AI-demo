/**
 * emailService.js — Transaction confirmation emails via PingOne Notifications API
 *
 * Uses the PingOne Management API to send email directly to the PingOne user
 * identified by their sub (userId). No external email provider needed — PingOne
 * handles delivery using its own configured email sender.
 *
 * API: POST /v1/environments/{envId}/users/{userId}/messages
 * Docs: https://apidocs.pingidentity.com/pingone/platform/v1/api/#post-send-user-message
 *
 * Required: the worker app (pingone_client_id / pingone_client_secret) must have
 * the "Notifications" scope: p1:create:userMessage
 *
 * If PingOne credentials are not configured, emails are silently skipped.
 */

'use strict';

const axios = require('axios');
const configStore = require('./configStore');

// ── Management token (reuses the worker client credentials) ──────────────────
async function getManagementToken() {
  const envId        = configStore.getEffective('pingone_environment_id');
  const region       = configStore.getEffective('pingone_region') || 'com';
  const clientId     = configStore.getEffective('pingone_client_id');
  const clientSecret = configStore.getEffective('pingone_client_secret');

  if (!envId || !clientId || !clientSecret) return null;

  const tokenUrl = `https://auth.pingone.${region}/${envId}/as/token`;
  const response = await axios.post(
    tokenUrl,
    'grant_type=client_credentials',
    {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );
  return response.data.access_token;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function buildEmailHtml({ type, amount, fromAccount, toAccount, newBalance, transactionId, userName, date }) {
  const typeLabels = { transfer: 'Transfer', deposit: 'Deposit', withdrawal: 'Withdrawal' };
  const typeColors = { transfer: '#277ba5', deposit: '#16a34a', withdrawal: '#dc2626' };
  const typeIcons  = { transfer: '↔', deposit: '⬇', withdrawal: '⬆' };

  const label = typeLabels[type] || type;
  const color = typeColors[type] || '#277ba5';
  const icon  = typeIcons[type]  || '💰';

  let accountRows = '';
  if (type === 'transfer' && fromAccount && toAccount) {
    accountRows = `
      <tr><td style="color:#6b7280;padding:4px 0">From</td><td style="padding:4px 0"><strong>${fromAccount}</strong></td></tr>
      <tr><td style="color:#6b7280;padding:4px 0">To</td><td style="padding:4px 0"><strong>${toAccount}</strong></td></tr>`;
  } else if (toAccount) {
    accountRows = `<tr><td style="color:#6b7280;padding:4px 0">Account</td><td style="padding:4px 0"><strong>${toAccount}</strong></td></tr>`;
  } else if (fromAccount) {
    accountRows = `<tr><td style="color:#6b7280;padding:4px 0">Account</td><td style="padding:4px 0"><strong>${fromAccount}</strong></td></tr>`;
  }

  const balanceRow = newBalance !== undefined
    ? `<tr><td style="color:#6b7280;padding:4px 0">New Balance</td><td style="padding:4px 0"><strong>${formatCurrency(newBalance)}</strong></td></tr>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:32px 16px">
    <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
      <tr><td style="background:linear-gradient(135deg,#1a5d80,${color});padding:28px 32px">
        <div style="color:#fff;font-size:13px;opacity:.8;margin-bottom:4px">BX Finance</div>
        <div style="color:#fff;font-size:22px;font-weight:700">${icon} ${label} Confirmation</div>
      </td></tr>
      <tr><td style="padding:28px 32px">
        <p style="margin:0 0 20px;color:#374151;font-size:15px">Hi ${userName},</p>
        <p style="margin:0 0 24px;color:#374151;font-size:15px">
          Your ${label.toLowerCase()} of <strong style="color:${color}">${formatCurrency(amount)}</strong> was processed successfully.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px">
          <tr><td style="color:#6b7280;padding:4px 0">Amount</td><td style="padding:4px 0"><strong style="color:${color}">${formatCurrency(amount)}</strong></td></tr>
          ${accountRows}
          ${balanceRow}
          <tr><td style="color:#6b7280;padding:4px 0">Date</td><td style="padding:4px 0">${date}</td></tr>
          <tr><td style="color:#6b7280;padding:4px 0">Reference</td><td style="padding:4px 0"><code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${transactionId}</code></td></tr>
        </table>
      </td></tr>
      <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
        <p style="margin:0;color:#9ca3af;font-size:12px">This is an automated confirmation from BX Finance Demo. Do not reply to this email.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/**
 * Send a transaction confirmation email via PingOne Notifications API.
 *
 * @param {string} userId   PingOne user sub (req.user.id)
 * @param {object} opts
 * @param {'transfer'|'deposit'|'withdrawal'} opts.type
 * @param {number}  opts.amount
 * @param {string}  [opts.fromAccount]
 * @param {string}  [opts.toAccount]
 * @param {number}  [opts.newBalance]
 * @param {string}  opts.transactionId
 * @param {string}  opts.userName
 */
async function sendTransactionConfirmation(userId, opts) {
  const envId  = configStore.getEffective('pingone_environment_id');
  const region = configStore.getEffective('pingone_region') || 'com';

  if (!envId || !userId) return; // not configured — silently skip

  const typeLabels = { transfer: 'Transfer', deposit: 'Deposit', withdrawal: 'Withdrawal' };
  const label = typeLabels[opts.type] || opts.type;
  const date  = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  try {
    const token = await getManagementToken();
    if (!token) return;

    await axios.post(
      `https://api.pingone.${region}/v1/environments/${envId}/users/${userId}/messages`,
      {
        content: [
          {
            deliveryMethod: 'Email',
            subject: `${label} Confirmation — ${formatCurrency(opts.amount)}`,
            body: buildEmailHtml({ ...opts, date }),
            charset: 'UTF-8',
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`📧 [Email] PingOne notification sent to user ${userId} — ${label} ${formatCurrency(opts.amount)}`);
  } catch (err) {
    // Never let email failure break the transaction response
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error(`📧 [Email] PingOne notification failed for user ${userId}: ${detail}`);
  }
}

module.exports = { sendTransactionConfirmation };
