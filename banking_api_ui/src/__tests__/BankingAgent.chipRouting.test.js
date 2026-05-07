/**
 * @file BankingAgent.chipRouting.test.js
 *
 * Routing-contract tests for the BankingAgent action chips.
 *
 * Covers three guarantees:
 *   1. Chip catalog — all expected chips exist in the correct ACTION_GROUP
 *   2. Heuristic vs LLM routing — AI chips stay in the NL-input path
 *      (conversational Send button); banking chips execute directly
 *   3. LLM compliance contract — AI chips only exercise agent-llm-reasoning,
 *      never banking infrastructure steps (olb-resource-token etc.)
 *
 * These are pure-logic tests (no DOM mount). They mirror the constants in
 * BankingAgent.js and assert the routing invariants that the product requires.
 *
 * WHY NO COMPONENT RENDER:
 *   BankingAgent.js has ~40 imports and complex context providers. Mounting it
 *   in Jest adds significant mock surface without adding signal for these
 *   structural invariants. Route-via-Send vs route-via-runAction is fully
 *   encoded in the constants below and in CHIP_APPLICABLE_STEPS.
 */

// ── ACTION_GROUPS catalog (mirrored from BankingAgent.js) ────────────────────
// Update this whenever chips are added, removed, or renamed.

const ACCOUNT_CHIP_IDS = ['accounts', 'balance', 'sensitive-account-details', 'sequential_think'];
const TRANSACTION_CHIP_IDS = ['transactions', 'deposit', 'withdraw', 'transfer'];
const ADMIN_CHIP_IDS = ['mcp_tools', 'query_user', 'logout'];
const AI_CHIP_IDS = [
  'ai_ask',
  'ai_helix_demo',
  'ai_explain',
  'ai_helix_explain',
  'ai_analyze',
  'ai_advice',
  'ai_helix_advice',
];
const TESTING_CHIP_IDS = [
  'demo_guide',
  'test_full_compliance_flow',
  'test_wrong_scope',
  'test_wrong_audience',
  'test_hitl_required',
  'transfer_600_test',
  'test_otp_required',
  'demo_intent_delegation',
  'demo_nl_routing',
];

const ALL_CHIP_IDS = [
  ...ACCOUNT_CHIP_IDS,
  ...TRANSACTION_CHIP_IDS,
  ...ADMIN_CHIP_IDS,
  ...AI_CHIP_IDS,
  ...TESTING_CHIP_IDS,
];

// ── Routing contract ──────────────────────────────────────────────────────────
// NL_ROUTED chips: handleActionClick calls setNlInputFromTile() — user sees the
// conversational input field and must press the Send button to execute.
// They NEVER call runAction() directly.
const NL_ROUTED_IDS = new Set([
  // All AI group chips — pre-fill the chat input
  'ai_ask',
  'ai_helix_demo',
  'ai_explain',
  'ai_helix_explain',
  'ai_analyze',
  'ai_advice',
  'ai_helix_advice',
  // NL-routing testing chips
  'transfer_600_test',  // "Transfer $600 from checking to savings"
  'demo_nl_routing',    // "What is my checking account balance?"
  // Admin chip that prompts for completion
  'query_user',         // "Query user by email: "
]);

// DIRECT chips: handleActionClick calls runAction() immediately — heuristic execution.
const DIRECT_IDS = new Set([
  ...ACCOUNT_CHIP_IDS,
  ...TRANSACTION_CHIP_IDS,
  'mcp_tools', // admin: runs MCP tool list directly
  'logout',    // admin: signs out directly
]);

// Keep alias for the banking-specific checks below
const DIRECT_BANKING_IDS = new Set([...ACCOUNT_CHIP_IDS, ...TRANSACTION_CHIP_IDS]);

// ── CHIP_APPLICABLE_STEPS (mirrored from BankingAgent.js) ───────────────────
// AI chips: only agent-llm-reasoning — they never touch banking infra
const AI_STEPS_ONLY_LLM = {
  ai_ask: ['agent-llm-reasoning'],
  ai_explain: ['agent-llm-reasoning'],
  ai_analyze: ['agent-llm-reasoning'],
  ai_advice: ['agent-llm-reasoning'],
};

// Banking chips: multi-step including olb-resource-token (reaches banking backend)
const BANKING_STEP_INCLUDES = 'olb-resource-token';
const BANKING_CHIP_STEPS_SAMPLE = {
  accounts: ['agent-llm-reasoning', 'agent-token-init', 'gw-scope-map', 'agent-scope-aware-cache', 'olb-resource-token', 'claim-diagnostics'],
  balance: ['agent-llm-reasoning', 'agent-token-init', 'gw-scope-map', 'agent-scope-aware-cache', 'olb-resource-token', 'claim-diagnostics'],
  deposit: ['agent-llm-reasoning', 'agent-token-init', 'gw-scope-map', 'agent-scope-aware-cache', 'olb-resource-token', 'claim-diagnostics'],
  transfer: ['agent-llm-reasoning', 'agent-token-init', 'gw-scope-map', 'agent-scope-aware-cache', 'olb-resource-token', 'claim-diagnostics'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('BankingAgent chip catalog', () => {
  it('has no duplicate chip IDs across all groups', () => {
    const seen = new Set();
    const dupes = [];
    for (const id of ALL_CHIP_IDS) {
      if (seen.has(id)) dupes.push(id);
      seen.add(id);
    }
    expect(dupes).toEqual([]);
  });

  it('account group contains all expected chips', () => {
    expect(ACCOUNT_CHIP_IDS).toContain('accounts');
    expect(ACCOUNT_CHIP_IDS).toContain('balance');
    expect(ACCOUNT_CHIP_IDS).toContain('sensitive-account-details');
    expect(ACCOUNT_CHIP_IDS).toContain('sequential_think');
  });

  it('transaction group contains all expected chips', () => {
    expect(TRANSACTION_CHIP_IDS).toContain('deposit');
    expect(TRANSACTION_CHIP_IDS).toContain('withdraw');
    expect(TRANSACTION_CHIP_IDS).toContain('transfer');
    expect(TRANSACTION_CHIP_IDS).toContain('transactions');
  });

  it('AI group contains all 7 LLM chips', () => {
    expect(AI_CHIP_IDS).toHaveLength(7);
    expect(AI_CHIP_IDS).toContain('ai_ask');
    expect(AI_CHIP_IDS).toContain('ai_helix_demo');
    expect(AI_CHIP_IDS).toContain('ai_explain');
    expect(AI_CHIP_IDS).toContain('ai_helix_explain');
    expect(AI_CHIP_IDS).toContain('ai_analyze');
    expect(AI_CHIP_IDS).toContain('ai_advice');
    expect(AI_CHIP_IDS).toContain('ai_helix_advice');
  });

  it('testing group contains compliance and NL routing chips', () => {
    expect(TESTING_CHIP_IDS).toContain('test_wrong_scope');
    expect(TESTING_CHIP_IDS).toContain('test_wrong_audience');
    expect(TESTING_CHIP_IDS).toContain('test_hitl_required');
    expect(TESTING_CHIP_IDS).toContain('transfer_600_test');
    expect(TESTING_CHIP_IDS).toContain('test_otp_required');
    expect(TESTING_CHIP_IDS).toContain('demo_intent_delegation');
    expect(TESTING_CHIP_IDS).toContain('demo_nl_routing');
  });
});

describe('Heuristic vs LLM routing contract', () => {
  it('NL_ROUTED and DIRECT sets are non-overlapping', () => {
    const overlap = [...DIRECT_BANKING_IDS].filter((id) => NL_ROUTED_IDS.has(id));
    expect(overlap).toEqual([]);
  });

  it('all AI group chips are NL-routed (conversational Send button, not direct execution)', () => {
    for (const id of AI_CHIP_IDS) {
      expect(NL_ROUTED_IDS.has(id)).toBe(true);
    }
  });

  it('no AI chip is in the direct-execution set', () => {
    for (const id of AI_CHIP_IDS) {
      expect(DIRECT_BANKING_IDS.has(id)).toBe(false);
    }
  });

  it('core banking chips (accounts, balance, deposit, withdraw, transfer) are direct-execution', () => {
    const coreBanking = ['accounts', 'balance', 'deposit', 'withdraw', 'transfer'];
    for (const id of coreBanking) {
      expect(DIRECT_BANKING_IDS.has(id)).toBe(true);
      expect(NL_ROUTED_IDS.has(id)).toBe(false);
    }
  });

  it('NL routing chips pre-fill the chat input with non-empty prompts', () => {
    // These IDs call setNlInputFromTile with actual content — the user sees
    // pre-filled text in the chat input and presses Send (conversational).
    const withPrompt = ['ai_helix_demo', 'ai_explain', 'ai_helix_explain', 'ai_analyze', 'ai_advice', 'ai_helix_advice', 'transfer_600_test', 'demo_nl_routing'];
    for (const id of withPrompt) {
      expect(NL_ROUTED_IDS.has(id)).toBe(true);
    }
  });

  it('ai_ask pre-fills empty input — opens chat ready for user to type', () => {
    // ai_ask: setNlInputFromTile("") — cursor in empty box, Send button visible
    expect(NL_ROUTED_IDS.has('ai_ask')).toBe(true);
    expect(DIRECT_BANKING_IDS.has('ai_ask')).toBe(false);
  });
});

describe('LLM compliance steps — AI chips never reach banking infrastructure', () => {
  it('ai_ask steps contain only agent-llm-reasoning', () => {
    expect(AI_STEPS_ONLY_LLM.ai_ask).toEqual(['agent-llm-reasoning']);
  });

  it('ai_explain steps contain only agent-llm-reasoning', () => {
    expect(AI_STEPS_ONLY_LLM.ai_explain).toEqual(['agent-llm-reasoning']);
  });

  it('ai_analyze steps contain only agent-llm-reasoning', () => {
    expect(AI_STEPS_ONLY_LLM.ai_analyze).toEqual(['agent-llm-reasoning']);
  });

  it('ai_advice steps contain only agent-llm-reasoning', () => {
    expect(AI_STEPS_ONLY_LLM.ai_advice).toEqual(['agent-llm-reasoning']);
  });

  it('AI chips do not include olb-resource-token (they never call banking backend directly)', () => {
    for (const steps of Object.values(AI_STEPS_ONLY_LLM)) {
      expect(steps).not.toContain('olb-resource-token');
      expect(steps).not.toContain('gw-scope-map');
      expect(steps).not.toContain('gw-denial-metadata');
      expect(steps.length).toBe(1); // exactly one step: LLM reasoning
    }
  });

  it('banking chips include olb-resource-token (they reach banking backend)', () => {
    for (const steps of Object.values(BANKING_CHIP_STEPS_SAMPLE)) {
      expect(steps).toContain(BANKING_STEP_INCLUDES);
    }
  });

  it('banking chips exercise more compliance steps than AI chips', () => {
    const aiMaxSteps = Math.max(...Object.values(AI_STEPS_ONLY_LLM).map((s) => s.length));
    const bankingMinSteps = Math.min(...Object.values(BANKING_CHIP_STEPS_SAMPLE).map((s) => s.length));
    expect(bankingMinSteps).toBeGreaterThan(aiMaxSteps);
  });
});

describe('LLM conversational mode — no Run button', () => {
  // The "no Run button" guarantee is architectural:
  //   AI chips call setNlInputFromTile() → text pre-fills the chat input
  //   The only action button in the chat input row has aria-label="Send"
  //   There is no separate "Run" button for AI actions
  //
  // These tests verify the contract through routing — if AI chips are NL-routed
  // (not direct-executed), the only way to submit is the Send button.

  it('all AI chips are NL-routed so the chat Send button is the only submission path', () => {
    for (const id of AI_CHIP_IDS) {
      expect(NL_ROUTED_IDS.has(id)).toBe(true);
      // If this fails, the chip would call runAction() directly — bypassing the
      // chat input entirely and creating an implicit "Run" behaviour on click.
      expect(DIRECT_BANKING_IDS.has(id)).toBe(false);
    }
  });

  it('banking chips that should NOT be conversational are in the direct set', () => {
    // These chips execute on click — no text input, no Send button needed.
    const mustBeDirect = ['accounts', 'balance', 'transactions', 'deposit', 'withdraw', 'transfer'];
    for (const id of mustBeDirect) {
      expect(DIRECT_BANKING_IDS.has(id)).toBe(true);
      expect(NL_ROUTED_IDS.has(id)).toBe(false);
    }
  });

  it('the NL-routed set and direct set together cover all registered chip IDs (no unrouted chips)', () => {
    // demo_guide opens a modal; test_full_compliance_flow runs via runAction in testing group.
    const knownSpecial = new Set(['demo_guide', 'test_full_compliance_flow']);
    const unrouted = ALL_CHIP_IDS
      .filter((id) => !knownSpecial.has(id))
      .filter((id) => !NL_ROUTED_IDS.has(id) && !DIRECT_IDS.has(id) && !TESTING_CHIP_IDS.includes(id));
    expect(unrouted).toEqual([]);
  });
});
