/**
 * Email notification service — nodemailer / Gmail SMTP.
 *
 * Configure via environment variables:
 *   EMAIL_USER          Gmail address (e.g. you@gmail.com)
 *   EMAIL_APP_PASSWORD  Gmail App Password (not your regular password)
 *   EMAIL_FROM_NAME     Display name (default: "BX Finance")
 *
 * If EMAIL_USER is not set the service is a no-op — no error thrown.
 * To create a Gmail App Password:
 *   1. Enable 2-Step Verification on your Google account
 *   2. Go to myaccount.google.com → Security → App Passwords
 *   3. Generate a password for "Mail"
 */

const nodemailer = require('nodemailer');

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function transactionEmailHtml({ type, amount, fromAccount, toAccount, newBalance, transactionId, userName, date }) {
  const typeLabels = { transfer: 'Transfer', deposit: 'Deposit', withdrawal: 'Withdrawal' };
  const typeColors = { transfer: '#277ba5', deposit: '#16a34a', withdrawal: '#dc2626' };
  const typeIcons  = { transfer: '↔', deposit: '⬇', withdrawal: '⬆' };

  const label = typeLabels[type] || type;
  const color = typeColors[type] || '#277ba5';
  const icon  = typeIcons[type] || '💰';

  let accountLine = '';
  if (type === 'transfer' && fromAccount && toAccount) {
    accountLine = `<tr><td style="color:#6b7280;padding:4px 0">From</td><td style="padding:4px 0"><strong>${fromAccount}</strong></td></tr>
                   <tr><td style="color:#6b7280;padding:4px 0">To</td><td style="padding:4px 0"><strong>${toAccount}</strong></td></tr>`;
  } else if (type === 'deposit' && toAccount) {
    accountLine = `<tr><td style="color:#6b7280;padding:4px 0">Account</td><td style="padding:4px 0"><strong>${toAccount}</strong></td></tr>`;
  } else if (type === 'withdrawal' && fromAccount) {
    accountLine = `<tr><td style="color:#6b7280;padding:4px 0">Account</td><td style="padding:4px 0"><strong>${fromAccount}</strong></td></tr>`;
  }

  const balanceLine = newBalance !== undefined
    ? `<tr><td style="color:#6b7280;padding:4px 0">New Balance</td><td style="padding:4px 0"><strong>${formatCurrency(newBalance)}</strong></td></tr>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:32px 16px">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a5d80,${color});padding:28px 32px">
          <div style="color:#fff;font-size:13px;opacity:.8;margin-bottom:4px">BX Finance</div>
          <div style="color:#fff;font-size:22px;font-weight:700">${icon} ${label} Confirmation</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px">
          <p style="margin:0 0 20px;color:#374151;font-size:15px">Hi ${userName},</p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px">
            Your ${label.toLowerCase()} of <strong style="color:${color}">${formatCurrency(amount)}</strong> was processed successfully.
          </p>

          <!-- Details table -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;padding-top:16px">
            <tr><td style="color:#6b7280;padding:4px 0">Amount</td><td style="padding:4px 0"><strong style="color:${color}">${formatCurrency(amount)}</strong></td></tr>
            ${accountLine}
            ${balanceLine}
            <tr><td style="color:#6b7280;padding:4px 0">Date</td><td style="padding:4px 0">${date}</td></tr>
            <tr><td style="color:#6b7280;padding:4px 0">Reference</td><td style="padding:4px 0"><code style="font-size:12px;background:#f3f4f6;padding:2px 6px;border-radius:4px">${transactionId}</code></td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">
            This is an automated confirmation from BX Finance Demo. Do not reply to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Send a transaction confirmation email.
 *
 * @param {string} toEmail
 * @param {object} opts
 * @param {'transfer'|'deposit'|'withdrawal'} opts.type
 * @param {number}  opts.amount
 * @param {string}  [opts.fromAccount]   Human-readable label
 * @param {string}  [opts.toAccount]     Human-readable label
 * @param {number}  [opts.newBalance]    Balance after transaction
 * @param {string}  opts.transactionId
 * @param {string}  opts.userName        First name or full name
 */
async function sendTransactionConfirmation(toEmail, opts) {
  const transporter = getTransporter();
  if (!transporter) return; // not configured — silently skip

  const fromName = process.env.EMAIL_FROM_NAME || 'BX Finance';
  const date = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });

  const typeLabels = { transfer: 'Transfer', deposit: 'Deposit', withdrawal: 'Withdrawal' };
  const label = typeLabels[opts.type] || opts.type;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to: toEmail,
      subject: `${label} Confirmation — ${formatCurrency(opts.amount)}`,
      html: transactionEmailHtml({ ...opts, date }),
    });
    console.log(`📧 [Email] Confirmation sent to ${toEmail} — ${label} ${formatCurrency(opts.amount)}`);
  } catch (err) {
    // Never let email failure break the transaction response
    console.error(`📧 [Email] Failed to send to ${toEmail}: ${err.message}`);
  }
}

module.exports = { sendTransactionConfirmation };
