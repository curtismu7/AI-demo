# Super Banking User Guide

> Complete guide for using the Super Banking demo application, including MFA setup, AI agent interactions, and common banking workflows.

**For technical setup and configuration, see:**
- [SETUP.md](./SETUP.md) — Complete setup guide for developers
- [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) — Authoritative PingOne configuration reference

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Multi-Factor Authentication (MFA)](#2-multi-factor-authentication-mfa)
3. [AI Banking Agent](#3-ai-banking-agent)
4. [Common Banking Workflows](#4-common-banking-workflows)
5. [Security Best Practices](#5-security-best-practices)
6. [Troubleshooting](#6-troubleshooting)

---

## 1. Getting Started

### 1.1 Login

**As an Admin:**
1. Navigate to `/admin` or click "Log In as Admin" on the landing page
2. You'll be redirected to PingOne for authentication
3. Enter your admin credentials
4. After successful login, you'll land on the admin dashboard

**As a Customer:**
1. Navigate to `/dashboard` or click "Log In" on the landing page
2. You'll be redirected to PingOne for authentication
3. Enter your customer credentials
4. After successful login, you'll land on your customer dashboard

### 1.2 Dashboard Overview

**Admin Dashboard:**
- View all users and accounts
- Manage transactions
- Configure application settings
- Monitor system activity
- Access audit logs

**Customer Dashboard:**
- View your accounts and balances
- See recent transactions
- Initiate transfers
- Access AI agent
- Manage your profile

---

## 2. Multi-Factor Authentication (MFA)

### 2.1 What is MFA?

Multi-Factor Authentication (MFA) adds an extra layer of security by requiring a second form of verification for sensitive operations. In Super Banking, MFA is required for:

- High-value transactions (above $500 by default)
- Account changes
- Sensitive data access
- Administrative operations

### 2.2 Supported MFA Methods

Super Banking supports three MFA methods:

1. **OTP (One-Time Password)** - A 6-digit code sent via email
2. **FIDO2/WebAuthn** - Hardware security keys or biometric authentication
3. **Push Notifications** - Mobile app approval

### 2.3 Setting Up MFA

**Step 1: Register Your Device**

1. Log in to Super Banking
2. Navigate to **Settings > Security**
3. Click **Register New Device**
4. Choose your device type (Mobile, Desktop, Hardware Key)
5. Follow the device-specific registration flow
6. Verify your device via email or SMS

**Step 2: Enable FIDO2 (Optional)**

If you have a FIDO2 security key:

1. Connect your USB key or enable NFC
2. Click **Register Security Key** in Settings
3. Touch the key when prompted
4. Set a name for your key
5. Test authentication to verify

### 2.4 Using MFA

**When MFA is Required:**

When you perform a sensitive operation, you'll see an MFA prompt:

1. Choose your preferred MFA method (OTP, FIDO2, or Push)
2. Complete the second factor authentication:
   - **OTP:** Enter the 6-digit code from your email
   - **FIDO2:** Touch your security key when prompted
   - **Push:** Approve the request in your mobile app
3. Your operation will proceed after successful verification

**Example: High-Value Transfer**

```
1. Initiate a transfer for $600 (above the $500 threshold)
2. System prompts: "Additional authentication required"
3. Choose MFA method (e.g., OTP)
4. Enter the 6-digit code from your email
5. Transfer completes successfully
```

### 2.5 MFA Troubleshooting

| Issue | Solution |
|-------|----------|
| No MFA prompt | Ensure you have registered a device in Settings |
| OTP not received | Check email spam folder, verify email address is correct |
| FIDO2 fails | Ensure your browser supports WebAuthn and key is registered |
| Push not received | Verify mobile app is installed and notifications are enabled |

---

## 3. AI Banking Agent

### 3.1 What is the AI Agent?

The AI Banking Agent is an intelligent assistant that helps you with banking operations using natural language. You can ask questions, request transactions, and get financial advice without navigating complex menus.

### 3.2 Accessing the AI Agent

**From Customer Dashboard:**
- Click the floating action button (FAB) in the bottom-right corner
- The agent panel will open on the right side

**From Admin Dashboard:**
- Click the AI Agent button in the navigation
- The agent panel will open

### 3.3 Common AI Agent Interactions

**Check Your Accounts:**
```
User: "Show me my accounts"
Agent: "Here's your account overview:
       - Checking Account: $2,450.32
       - Savings Account: $12,300.00
       - Credit Card: $450.00 balance"
```

**Transfer Money:**
```
User: "Transfer $500 from checking to savings"
Agent: "I can transfer $500 from your checking to savings account.
       Confirm this transaction?"
User: "Yes"
Agent: "Transfer completed! Your savings account now has $12,800.00"
```

**View Transactions:**
```
User: "Show me recent transactions"
Agent: "Here are your recent transactions:
       - Netflix subscription: -$15.99
       - Grocery store: -$85.50
       - Salary deposit: +$3,200.00
       - Coffee shop: -$4.50"
```

**Get Financial Advice:**
```
User: "How can I save more money?"
Agent: "Based on your spending patterns, here are savings suggestions:
       1. Reduce dining out by 20%: Save $70/month
       2. Cancel unused subscriptions: Save $25/month
       3. Switch to a no-fee bank account: Save $15/month
       Total potential savings: $110/month"
```

### 3.4 Agent Capabilities

The AI Agent can help you with:

- **Account Information:** View balances, account details, transaction history
- **Transactions:** Transfer money, pay bills, send peer-to-peer payments
- **Financial Advice:** Savings recommendations, budget optimization, spending analysis
- **Security:** Report suspicious activity, review account security
- **Planning:** Set savings goals, track progress, get retirement advice

### 3.5 Agent Limitations

The AI Agent cannot:

- Perform operations that require MFA without your approval
- Access other users' accounts
- Make changes to your account settings
- Bypass security measures
- Perform administrative operations (for customer users)

### 3.6 Agent Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent not responding | Check your internet connection, refresh the page |
| "Could not parse" error | Try rephrasing your request, check if the service is available |
| Agent says "missing scope" | Ensure your user has the correct permissions, contact admin |
| Agent shows white overlay | Collapse and reopen the agent panel |

---

## 4. Common Banking Workflows

### 4.1 Transfer Money

**Step-by-Step:**

1. **Navigate to Transfers**
   - From dashboard, click "Transfers" in the navigation
   - Or use the AI Agent: "Transfer $X from A to B"

2. **Enter Transfer Details**
   - Select source account
   - Select destination account or enter recipient details
   - Enter amount
   - Add optional memo/note

3. **Review and Confirm**
   - Review transfer details
   - If amount exceeds MFA threshold, complete MFA verification
   - Click "Confirm Transfer"

4. **Confirmation**
   - You'll see a confirmation message
   - Transaction will appear in your transaction history

### 4.2 View Account Details

**Step-by-Step:**

1. **Navigate to Accounts**
   - From dashboard, click "Accounts" in the navigation
   - Or use the AI Agent: "Show me my accounts"

2. **Select Account**
   - Click on the account you want to view
   - You'll see account details, balance, and recent transactions

3. **Filter Transactions**
   - Use date range filters
   - Filter by transaction type
   - Search by merchant or description

### 4.3 Pay Bills

**Step-by-Step:**

1. **Navigate to Bill Pay**
   - From dashboard, click "Bill Pay" in the navigation

2. **Add Payee (if new)**
   - Click "Add Payee"
   - Enter payee details (name, account number, address)
   - Save payee

3. **Schedule Payment**
   - Select payee from your list
   - Enter payment amount
   - Choose payment date (immediate or scheduled)
   - Add optional memo

4. **Confirm Payment**
   - Review payment details
   - Complete MFA if required
   - Click "Confirm Payment"

### 4.4 Manage Savings Goals

**Step-by-Step:**

1. **Navigate to Savings Goals**
   - From dashboard, click "Savings Goals" in the navigation
   - Or use the AI Agent: "Help me save for a vacation"

2. **Create New Goal**
   - Click "Create New Goal"
   - Enter goal name (e.g., "Vacation", "Emergency Fund")
   - Set target amount
   - Choose target date
   - Select funding account

3. **Set Up Automatic Transfers**
   - Choose transfer frequency (weekly, monthly)
   - Enter transfer amount
   - Set start date

4. **Track Progress**
   - View goal progress on dashboard
   - Agent will provide updates and suggestions
   - Adjust contributions as needed

---

## 5. Security Best Practices

### 5.1 Account Security

**Enable MFA:**
- Register at least one device for MFA
- Enable FIDO2 if you have a security key
- Keep your contact information up to date

**Strong Passwords:**
- Use a unique, strong password for your PingOne account
- Enable password manager for convenience
- Never share your password

**Session Management:**
- Log out when you're done, especially on shared devices
- Don't leave your account unattended
- Use the official logout button

### 5.2 Transaction Security

**Verify Transactions:**
- Always review transaction details before confirming
- Check recipient information carefully
- Enable transaction alerts for amounts over $100

**High-Value Transactions:**
- Be prepared for MFA verification
- Double-check all details
- Contact support immediately if something seems wrong

**Monitor Activity:**
- Review your transaction history regularly
- Report suspicious activity immediately
- Use the AI Agent to review recent transactions

### 5.3 Device Security

**Keep Devices Secure:**
- Use device PIN/biometrics
- Keep operating system updated
- Install security software

**Secure Networks:**
- Avoid public Wi-Fi for sensitive transactions
- Use VPN when on public networks
- Verify HTTPS in browser address bar

**Lost or Stolen Device:**
- Contact support immediately to freeze your account
- Revoke device access in Settings
- Change your password

### 5.4 Phishing Awareness

**Recognize Phishing:**
- Be suspicious of urgent requests
- Verify sender email addresses
- Don't click links in unsolicited emails
- Check URLs before entering credentials

**Report Suspicious Activity:**
- Use the AI Agent: "I think I received a phishing email"
- Contact support immediately
- Forward suspicious emails to security team

---

## 6. Troubleshooting

### 6.1 Login Issues

**Problem: Can't log in**
- Solution: Verify your credentials, check if your account is locked, contact admin

**Problem: Redirect loop after login**
- Solution: Clear browser cookies, try incognito mode, check redirect URI configuration

**Problem: "Invalid state" error**
- Solution: Clear session cookies, ensure session store is configured correctly

### 6.2 Transaction Issues

**Problem: Transaction failed**
- Solution: Check account balance, verify recipient details, ensure sufficient funds

**Problem: MFA not working**
- Solution: Ensure device is registered, try alternative MFA method, check email/spam

**Problem: Transaction pending too long**
- Solution: Wait a few minutes, check transaction history, contact support if still pending

### 6.3 Agent Issues

**Problem: Agent not responding**
- Solution: Check internet connection, refresh the page, check if service is available

**Problem: Agent gives wrong information**
- Solution: Rephrase your request, be more specific, contact support if issue persists

**Problem: Agent can't perform operation**
- Solution: Check if you have required permissions, ensure MFA is completed, contact admin

### 6.4 General Issues

**Problem: Page not loading**
- Solution: Check internet connection, clear browser cache, try different browser

**Problem: Data not updating**
- Solution: Refresh the page, check if session is valid, log out and back in

**Problem: Error message unclear**
- Solution: Contact support with error details, check browser console for technical details

### 6.5 Getting Help

**In-App Help:**
- Use the AI Agent: "I need help with..."
- Check the Help section in Settings
- Review error messages for specific guidance

**Contact Support:**
- Email: support@banking-demo.com
- Phone: 1-800-BANK-HELP
- In-app: Submit support request from Settings

**When Contacting Support:**
- Describe the issue clearly
- Include error messages
- Note steps to reproduce
- Provide your account information

---

## 7. Additional Resources

**Technical Documentation:**
- [SETUP.md](./SETUP.md) — Complete setup guide for developers
- [PINGONE_RESOURCES_AND_SCOPES_MATRIX.md](./PINGONE_RESOURCES_AND_SCOPES_MATRIX.md) — Authoritative PingOne configuration
- [PINGONE_APP_CONFIG.md](./PINGONE_APP_CONFIG.md) — App configuration reference

**Security Documentation:**
- [MFA_SETUP_GUIDE.md](./MFA_SETUP_GUIDE.md) — Detailed MFA configuration guide

**Agent Documentation:**
- [AGENT_SHOWCASE_DEMO_SCENARIOS.md](./AGENT_SHOWCASE_DEMO_SCENARIOS.md) — Demo scenarios and use cases

---

**Last Updated:** April 10, 2026
**Version:** 1.0
