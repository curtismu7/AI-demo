/**
 * Full chip-heuristic contract tests for nlIntentParser.
 *
 * Covers every chip label and suggestion text that appears in BankingAgent.js
 * and asserts the heuristic produces the expected kind + action/panel.
 *
 * Also covers the two non-banking vertical themes: healthcare and sporting-goods.
 * Admin and retail themes have their own describe blocks at the bottom.
 */
const { parseHeuristic } = require('../../services/nlIntentParser');

// ── helpers ───────────────────────────────────────────────────────────────────

function bank(msg, vertical = 'banking') {
  const r = parseHeuristic(msg, vertical);
  expect(r.kind).toBe('banking');
  return r;
}

function edu(msg, vertical = 'banking') {
  const r = parseHeuristic(msg, vertical);
  expect(r.kind).toBe('education');
  return r;
}

function none(msg, vertical = 'banking') {
  const r = parseHeuristic(msg, vertical);
  expect(r.kind).toBe('none');
  return r;
}

// ── Action chip labels (from BankingAgent.js ACTION_GROUPS) ─────────────────
// Each chip label is the exact string shown in the UI. The heuristic must map
// it to the correct banking action so the chip works in heuristic-only mode.

describe('nlIntentParser — banking action chips (heuristic)', () => {
  // Account group
  it('"My Accounts" chip → accounts', () => {
    expect(bank('My Accounts').banking.action).toBe('accounts');
  });

  it('"Check Balance" chip → balance', () => {
    expect(bank('Check Balance').banking.action).toBe('balance');
  });

  it('"View Sensitive Account Details" chip → sensitive_account_details', () => {
    expect(bank('View Sensitive Account Details').banking.action).toBe('sensitive_account_details');
  });

  // Transaction group
  it('"Recent Transactions" chip → transactions', () => {
    expect(bank('Recent Transactions').banking.action).toBe('transactions');
  });

  it('"Deposit" chip → deposit', () => {
    expect(bank('Deposit').banking.action).toBe('deposit');
  });

  it('"Withdraw" chip → withdraw', () => {
    expect(bank('Withdraw').banking.action).toBe('withdraw');
  });

  it('"Transfer" chip → transfer', () => {
    expect(bank('Transfer').banking.action).toBe('transfer');
  });

  // Admin / tools group
  it('"MCP Tools" chip → mcp_tools', () => {
    expect(bank('MCP Tools').banking.action).toBe('mcp_tools');
  });

  it('"Log Out" chip → logout', () => {
    expect(bank('Log Out').banking.action).toBe('logout');
  });

  // Phase 266 chips
  it('"API-Key Path Demo" chip → api_key_demo', () => {
    expect(bank('API-Key Path Demo').banking.action).toBe('api_key_demo');
  });

  it('"Access + ID-Token Path Demo" chip → dual_token_demo', () => {
    expect(bank('Access + ID-Token Path Demo').banking.action).toBe('dual_token_demo');
  });
});

// ── Suggestion chip texts (customer) ─────────────────────────────────────────
// These are the pre-written prompts shown as clickable suggestion buttons.

describe('nlIntentParser — customer suggestion chips (heuristic)', () => {
  it('"Show me my accounts" → accounts', () => {
    expect(bank('Show me my accounts').banking.action).toBe('accounts');
  });

  it('"Show me my full account details" → sensitive_account_details', () => {
    expect(bank('Show me my full account details').banking.action).toBe('sensitive_account_details');
  });

  it('"Transfer $100 from checking to savings" → transfer with params', () => {
    const r = bank('Transfer $100 from checking to savings');
    expect(r.banking.action).toBe('transfer');
    expect(r.banking.params.amount).toBe(100);
    expect(r.banking.params.fromId).toBe('checking');
    expect(r.banking.params.toId).toBe('savings');
  });

  it('"Deposit $50 into checking" → deposit with params', () => {
    const r = bank('Deposit $50 into checking');
    expect(r.banking.action).toBe('deposit');
    expect(r.banking.params.amount).toBe(50);
  });

  it('"What is my current balance?" → balance', () => {
    expect(bank('What is my current balance?').banking.action).toBe('balance');
  });

  it('"What are my recent transactions?" → transactions', () => {
    expect(bank('What are my recent transactions?').banking.action).toBe('transactions');
  });
});

// ── Suggestion chip texts (admin) ─────────────────────────────────────────────

describe('nlIntentParser — admin suggestion chips (heuristic)', () => {
  it('"Show all customer accounts" → accounts', () => {
    expect(bank('Show all customer accounts').banking.action).toBe('accounts');
  });

  it('"View customer transactions" → transactions', () => {
    expect(bank('View customer transactions').banking.action).toBe('transactions');
  });
});

// ── Education chip labels (from EDUCATION_LABELS in BankingAgent.chips.test.js) ──

describe('nlIntentParser — education chips (heuristic)', () => {
  it('"OAuth: Authorization Code + PKCE" label → login-flow panel', () => {
    const r = edu('what is pkce');
    expect(r.education.panel).toBe('login-flow');
  });

  it('"OAuth: Token exchange (RFC 8693)" → token-exchange panel', () => {
    const r = edu('what is token exchange');
    expect(r.education.panel).toBe('token-exchange');
  });

  it('"MCP protocol" chip text → mcp-protocol panel', () => {
    const r = edu('what is mcp');
    expect(r.education.panel).toBe('mcp-protocol');
  });

  it('"Token introspection (RFC 7662)" → introspection panel', () => {
    const r = edu('explain introspect');
    expect(r.education.panel).toBe('introspection');
  });

  it('"may_act / act claims" → may-act panel', () => {
    const r = edu('explain may_act claim');
    expect(r.education.panel).toBe('may-act');
  });

  it('"AI Agent Best Practices" chip → best-practices panel', () => {
    const r = edu('ai agent best practices');
    expect(r.education.panel).toBe('best-practices');
  });

  it('"CIBA" suggestion → ciba: true (not a panel)', () => {
    const r = parseHeuristic('What is CIBA?');
    expect(r.kind).toBe('education');
    expect(r.ciba).toBe(true);
  });

  it('"Human in the loop" chip → human-in-loop panel', () => {
    const r = edu('what is hitl');
    expect(r.education.panel).toBe('human-in-loop');
  });

  it('"Step-up auth" → step-up panel', () => {
    const r = edu('what is step up auth');
    expect(r.education.panel).toBe('step-up');
  });

  it('"Token Chain" → token-chain panel', () => {
    const r = edu('explain token-chain');
    expect(r.education.panel).toBe('token-chain');
  });

  it('"PAR (RFC 9126)" → par panel', () => {
    const r = edu('what is par');
    expect(r.education.panel).toBe('par');
  });

  it('"RAR (RFC 9396)" → rar panel', () => {
    const r = edu('what is rar');
    expect(r.education.panel).toBe('rar');
  });

  it('"Agentic Maturity Model" → agentic-maturity panel', () => {
    const r = edu('agentic maturity model');
    expect(r.education.panel).toBe('agentic-maturity');
  });

  it('"LangChain" → langchain panel', () => {
    const r = edu('what is langchain');
    expect(r.education.panel).toBe('langchain');
  });

  it('"Agent Gateway / RFC 8707" → agent-gateway panel', () => {
    const r = edu('what is agent gateway');
    expect(r.education.panel).toBe('agent-gateway');
  });

  it('"PingOne Authorize" → pingone-authorize panel', () => {
    const r = edu('what is pingone authorize');
    expect(r.education.panel).toBe('pingone-authorize');
  });

  it('"CIMD / DCR (RFC 7591)" → cimd panel', () => {
    const r = edu('what is cimd');
    expect(r.education.panel).toBe('cimd');
  });
});

// ── Balance variants (chip sends "Check Balance", NL forms vary) ──────────────

describe('nlIntentParser — balance heuristic variants', () => {
  it('"balance" bare word → balance', () => {
    expect(bank('balance').banking.action).toBe('balance');
  });

  it('"show my savings balance" → balance accountType=savings', () => {
    const r = bank('show my savings balance');
    expect(r.banking.action).toBe('balance');
    expect(r.banking.params.accountType).toBe('savings');
  });

  it('"checking balance" → balance accountType=checking', () => {
    const r = bank('checking balance');
    expect(r.banking.action).toBe('balance');
    expect(r.banking.params.accountType).toBe('checking');
  });

  it('"my current balance" → balance (no account type)', () => {
    const r = bank('my current balance');
    expect(r.banking.action).toBe('balance');
    expect(r.banking.params).toBeUndefined();
  });
});

// ── Transfer / deposit / withdraw with amounts ────────────────────────────────

describe('nlIntentParser — amount parsing chips', () => {
  it('"Transfer $250 from savings to checking" → transfer with correct params', () => {
    const r = bank('Transfer $250 from savings to checking');
    expect(r.banking.action).toBe('transfer');
    expect(r.banking.params.amount).toBe(250);
    expect(r.banking.params.fromId).toBe('savings');
    expect(r.banking.params.toId).toBe('checking');
  });

  it('"Withdraw $200 from checking" → withdraw amount=200', () => {
    const r = bank('Withdraw $200 from checking');
    expect(r.banking.action).toBe('withdraw');
    expect(r.banking.params.amount).toBe(200);
    expect(r.banking.params.fromId).toBe('checking');
  });

  it('"Deposit $1000 into savings" → deposit amount=1000 toId=savings', () => {
    const r = bank('Deposit $1000 into savings');
    expect(r.banking.action).toBe('deposit');
    expect(r.banking.params.amount).toBe(1000);
    expect(r.banking.params.toId).toBe('savings');
  });
});

// ── MCP tools chip — never hijacked by education regex ────────────────────────

describe('nlIntentParser — mcp_tools chip immunity to edu regex', () => {
  it('"list mcp tools" → mcp_tools (not education)', () => {
    const r = parseHeuristic('list mcp tools');
    expect(r.kind).toBe('banking');
    expect(r.banking.action).toBe('mcp_tools');
  });

  it('"show mcp tools" → mcp_tools', () => {
    expect(bank('show mcp tools').banking.action).toBe('mcp_tools');
  });

  it('"show available tools" → mcp_tools', () => {
    expect(bank('show available tools').banking.action).toBe('mcp_tools');
  });

  it('"get mcp tools" → mcp_tools', () => {
    expect(bank('get mcp tools').banking.action).toBe('mcp_tools');
  });

  it('"what mcp tools are available" → mcp_tools', () => {
    expect(bank('what mcp tools are available').banking.action).toBe('mcp_tools');
  });

  it('"what is mcp" → education (not mcp_tools)', () => {
    const r = parseHeuristic('what is mcp');
    expect(r.kind).toBe('education');
    expect(r.education.panel).toBe('mcp-protocol');
  });
});

// ── Mortgage chip ──────────────────────────────────────────────────────────────

describe('nlIntentParser — mortgage chip', () => {
  it('"show my mortgage" → mortgage_demo', () => {
    expect(bank('show my mortgage').banking.action).toBe('mortgage_demo');
  });

  it('"mortgage balance" → mortgage_demo (NOT generic balance)', () => {
    expect(bank('mortgage balance').banking.action).toBe('mortgage_demo');
  });

  it('"home loan details" → mortgage_demo', () => {
    expect(bank('home loan details').banking.action).toBe('mortgage_demo');
  });

  it('"mortgage" bare word → mortgage_demo', () => {
    expect(bank('mortgage').banking.action).toBe('mortgage_demo');
  });
});

// ── Spending / biggest purchase chips ─────────────────────────────────────────

describe('nlIntentParser — spending_summary and biggest_purchase chips', () => {
  it('"spending summary" → spending_summary', () => {
    expect(bank('spending summary').banking.action).toBe('spending_summary');
  });

  it('"how much did I spend this month" → spending_summary', () => {
    expect(bank('how much did I spend this month').banking.action).toBe('spending_summary');
  });

  it('"biggest purchase" → biggest_purchase', () => {
    expect(bank('biggest purchase').banking.action).toBe('biggest_purchase');
  });

  it('"largest transaction" → biggest_purchase', () => {
    expect(bank('largest transaction').banking.action).toBe('biggest_purchase');
  });

  it('"most expensive purchase" → biggest_purchase', () => {
    expect(bank('most expensive purchase').banking.action).toBe('biggest_purchase');
  });
});

// ── Fallback / none ───────────────────────────────────────────────────────────

describe('nlIntentParser — heuristic none fallback', () => {
  it('empty string → none with message', () => {
    const r = none('');
    expect(typeof r.message).toBe('string');
  });

  it('whitespace → none', () => {
    none('   ');
  });

  it('unrelated phrase → none with catalog message', () => {
    const r = none('the weather is sunny today');
    expect(r.message).toMatch(/can help/i);
    expect(r.message).toMatch(/balance/);
  });
});

// ── Healthcare is now a FIRST-CLASS PLUGIN (not THEME_VOCAB translation) ────────
// Healthcare ships config/verticals/healthcare/index.js, so parseHeuristic routes
// its phrases through the plugin's OWN heuristics → { kind:'vertical', action:<healthcare action> },
// NOT the legacy THEME_VOCAB banking translation. These tests assert the
// post-migration behavior: healthcare phrases resolve to healthcare actions, with
// no banking fallback. (Helper: assert kind:'vertical' + the healthcare action name.)
describe('nlIntentParser — healthcare plugin routing (first-class, not translated)', () => {
  const V = 'healthcare';
  function vertical(msg) {
    const r = parseHeuristic(msg, V);
    expect(r.kind).toBe('vertical');
    expect(r.vertical).toBe('healthcare');
    return r;
  }

  it('"my records" → view_records (its own action, not banking accounts)', () => {
    expect(vertical('my records').action).toBe('view_records');
  });

  it('"patient records" → view_records', () => {
    expect(vertical('patient records').action).toBe('view_records');
  });

  it('"check coverage" → view_coverage (not banking balance)', () => {
    expect(vertical('check coverage').action).toBe('view_coverage');
  });

  it('"my coverage" → view_coverage', () => {
    expect(vertical('my coverage').action).toBe('view_coverage');
  });

  it('"my appointments" → list_appointments (not banking transactions)', () => {
    expect(vertical('my appointments').action).toBe('list_appointments');
  });

  it('"book an appointment" → book_appointment (NOVEL action, no banking analog)', () => {
    expect(vertical('book an appointment').action).toBe('book_appointment');
  });

  it('"schedule an appointment" → book_appointment', () => {
    expect(vertical('schedule an appointment').action).toBe('book_appointment');
  });

  it('"release my records" → release_records (not banking transfer)', () => {
    expect(vertical('release my records').action).toBe('release_records');
  });

  it('"share my records" → release_records', () => {
    expect(vertical('share my records').action).toBe('release_records');
  });

  it('a non-matching phrase returns kind:none — NEVER a banking fallback', () => {
    const r = parseHeuristic('the weather is nice', V);
    expect(r.kind).toBe('none');
  });
});

// ── Sporting-goods theme chips ────────────────────────────────────────────────
// THEME_VOCAB['sporting-goods'] maps sport-retail phrases to banking actions.

describe('nlIntentParser — sporting-goods theme chips', () => {
  const V = 'sporting-goods';

  it('"my gear" → accounts (gear list = account list)', () => {
    expect(bank('my gear', V).banking.action).toBe('accounts');
  });

  it('"my equipment" → accounts', () => {
    expect(bank('my equipment', V).banking.action).toBe('accounts');
  });

  it('"my loyalty account" → accounts', () => {
    expect(bank('my loyalty account', V).banking.action).toBe('accounts');
  });

  it('"my rewards points" → balance (points balance = account balance)', () => {
    expect(bank('my rewards points', V).banking.action).toBe('balance');
  });

  it('"how many points" → balance', () => {
    expect(bank('how many points', V).banking.action).toBe('balance');
  });

  it('"point balance" → balance', () => {
    expect(bank('point balance', V).banking.action).toBe('balance');
  });

  it('"purchase history" → transactions (purchase history = transaction history)', () => {
    expect(bank('purchase history', V).banking.action).toBe('transactions');
  });

  it('"what did I buy" → transactions', () => {
    expect(bank('what did I buy', V).banking.action).toBe('transactions');
  });

  it('"what have I bought" → transactions', () => {
    expect(bank('what have I bought', V).banking.action).toBe('transactions');
  });

  it('"recent purchases" → transactions', () => {
    expect(bank('recent purchases', V).banking.action).toBe('transactions');
  });

  it('"my purchases" → transactions', () => {
    expect(bank('my purchases', V).banking.action).toBe('transactions');
  });

  it('"my returns" → transactions (returns = transaction history)', () => {
    expect(bank('my returns', V).banking.action).toBe('transactions');
  });

  it('"return history" → transactions', () => {
    expect(bank('return history', V).banking.action).toBe('transactions');
  });

  it('"refund history" → transactions', () => {
    expect(bank('refund history', V).banking.action).toBe('transactions');
  });

  it('"place an order" → transfer (checkout = fund transfer action)', () => {
    expect(bank('place an order', V).banking.action).toBe('transfer');
  });

  it('"checkout" → transfer', () => {
    expect(bank('checkout', V).banking.action).toBe('transfer');
  });

  it('"buy now" → transfer', () => {
    expect(bank('buy now', V).banking.action).toBe('transfer');
  });

  it('"biggest purchase" → biggest_purchase', () => {
    expect(bank('biggest purchase', V).banking.action).toBe('biggest_purchase');
  });

  it('"most expensive order" → biggest_purchase', () => {
    expect(bank('most expensive order', V).banking.action).toBe('biggest_purchase');
  });

  it('"how much have I spent" → spending_summary', () => {
    expect(bank('how much have I spent', V).banking.action).toBe('spending_summary');
  });

  it('"total purchases" → transactions (purchases? theme rule fires before spending_summary)', () => {
    // The sporting-goods theme maps `purchases?` → transactions;
    // "total purchases" contains "purchases" so the theme rule wins.
    expect(bank('total purchases', V).banking.action).toBe('transactions');
  });

  it('"spending breakdown" → spending_summary', () => {
    expect(bank('spending breakdown', V).banking.action).toBe('spending_summary');
  });

  // Education and core banking fall through correctly
  it('education phrases still work in sporting-goods theme', () => {
    const r = parseHeuristic('what is mcp', V);
    expect(r.kind).toBe('education');
    expect(r.education.panel).toBe('mcp-protocol');
  });

  it('"Log Out" still routes to logout in sporting-goods theme', () => {
    expect(bank('Log Out', V).banking.action).toBe('logout');
  });

  it('"list mcp tools" still routes to mcp_tools in sporting-goods theme', () => {
    expect(bank('list mcp tools', V).banking.action).toBe('mcp_tools');
  });
});

// ── Admin theme chips ─────────────────────────────────────────────────────────

describe('nlIntentParser — admin theme chips', () => {
  const V = 'admin';

  it('"look up customer" → accounts', () => {
    expect(bank('look up customer', V).banking.action).toBe('accounts');
  });

  it('"find user" → accounts', () => {
    expect(bank('find user', V).banking.action).toBe('accounts');
  });

  it('"lookup customer" → accounts', () => {
    expect(bank('lookup customer', V).banking.action).toBe('accounts');
  });

  it('"view transactions" → transactions', () => {
    expect(bank('view transactions', V).banking.action).toBe('transactions');
  });

  it('"customer activity" → transactions', () => {
    expect(bank('customer activity', V).banking.action).toBe('transactions');
  });

  it('"view profile" → accounts', () => {
    expect(bank('view profile', V).banking.action).toBe('accounts');
  });

  it('"customer profile" → accounts', () => {
    expect(bank('customer profile', V).banking.action).toBe('accounts');
  });

  it('"account details" (admin) → accounts', () => {
    expect(bank('account details', V).banking.action).toBe('accounts');
  });

  it('"get customer accounts" → accounts', () => {
    expect(bank('get customer accounts', V).banking.action).toBe('accounts');
  });

  it('"view accounts" → accounts', () => {
    expect(bank('view accounts', V).banking.action).toBe('accounts');
  });

  it('"freeze account" → transfer (admin freeze = transfer action)', () => {
    expect(bank('freeze account', V).banking.action).toBe('transfer');
  });

  it('"suspend the user" → transfer', () => {
    expect(bank('suspend the user', V).banking.action).toBe('transfer');
  });

  it('"adjust balance" → transfer', () => {
    expect(bank('adjust balance', V).banking.action).toBe('transfer');
  });
});

// ── Retail theme chips ────────────────────────────────────────────────────────

describe('nlIntentParser — retail theme chips', () => {
  const V = 'retail';

  it('"my orders" → accounts', () => {
    expect(bank('my orders', V).banking.action).toBe('accounts');
  });

  it('"order history" → accounts', () => {
    expect(bank('order history', V).banking.action).toBe('accounts');
  });

  it('"order status" → accounts', () => {
    expect(bank('order status', V).banking.action).toBe('accounts');
  });

  it('"my rewards points" → balance', () => {
    expect(bank('my rewards points', V).banking.action).toBe('balance');
  });

  it('"point balance" → balance', () => {
    expect(bank('point balance', V).banking.action).toBe('balance');
  });

  it('"purchase history" → transactions', () => {
    expect(bank('purchase history', V).banking.action).toBe('transactions');
  });

  it('"what did I buy" → transactions', () => {
    expect(bank('what did I buy', V).banking.action).toBe('transactions');
  });

  it('"recent purchases" → transactions', () => {
    expect(bank('recent purchases', V).banking.action).toBe('transactions');
  });

  it('"my returns" → transactions', () => {
    expect(bank('my returns', V).banking.action).toBe('transactions');
  });

  it('"checkout" → transfer', () => {
    expect(bank('checkout', V).banking.action).toBe('transfer');
  });

  it('"place an order" → accounts (orders? theme rule fires before place.*order → transfer)', () => {
    // The retail theme's `orders?` rule (action: accounts) is listed before the
    // `place.*order` rule (action: transfer) and matches "order" in "place an order".
    expect(bank('place an order', V).banking.action).toBe('accounts');
  });

  it('"buy now" → transfer', () => {
    expect(bank('buy now', V).banking.action).toBe('transfer');
  });

  it('"biggest purchase" → biggest_purchase', () => {
    expect(bank('biggest purchase', V).banking.action).toBe('biggest_purchase');
  });

  it('"how much have I spent" → spending_summary', () => {
    expect(bank('how much have I spent', V).banking.action).toBe('spending_summary');
  });

  it('"spending breakdown" → spending_summary', () => {
    expect(bank('spending breakdown', V).banking.action).toBe('spending_summary');
  });
});
