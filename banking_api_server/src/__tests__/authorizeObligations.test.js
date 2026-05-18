/**
 * @file authorizeObligations.test.js
 * Shared obligation classifier — the single source of truth both the simulated
 * AS and pingOneAuthorizeService use to map obligations -> enforcement flags.
 * Locks the H2 invariants: mutually-exclusive classification (consent wins
 * over generic HITL), highest-gate-wins (STEP_UP dominates), and the
 * informational `classified` breakdown.
 */

const {
  classifyObligation,
  classifyObligations,
} = require('../../services/authorizeObligations');

describe('classifyObligation (single obligation -> kind)', () => {
  it('maps STEP_UP and STEPUP variants to stepUp', () => {
    expect(classifyObligation({ type: 'STEP_UP' })).toBe('stepUp');
    expect(classifyObligation({ id: 'step_up_mfa' })).toBe('stepUp');
    expect(classifyObligation({ type: 'STEPUP' })).toBe('stepUp');
  });

  it('maps HITL_CONSENT to consent (NOT hitl) — most specific wins', () => {
    // The core H2 bug: HITL_CONSENT used to match both the HITL and consent
    // regexes. It must classify as consent only.
    expect(classifyObligation({ type: 'HITL_CONSENT' })).toBe('consent');
  });

  it('maps generic HITL / HUMAN_APPROVAL to hitl', () => {
    expect(classifyObligation({ type: 'HITL' })).toBe('hitl');
    expect(classifyObligation({ type: 'HUMAN_APPROVAL' })).toBe('hitl');
  });

  it('returns null for unknown / empty obligations', () => {
    expect(classifyObligation({ type: 'LOG_ONLY' })).toBeNull();
    expect(classifyObligation({})).toBeNull();
    expect(classifyObligation(null)).toBeNull();
  });
});

describe('classifyObligations (list -> highest-gate-wins flags)', () => {
  it('empty / non-array -> all flags false', () => {
    for (const input of [[], null, undefined, 'nope']) {
      const r = classifyObligations(input);
      expect(r).toMatchObject({
        stepUpRequired: false,
        hitlRequired: false,
        consentRequired: false,
      });
    }
  });

  it('STEP_UP alone -> stepUpRequired only', () => {
    const r = classifyObligations([{ type: 'STEP_UP' }]);
    expect(r.stepUpRequired).toBe(true);
    expect(r.hitlRequired).toBe(false);
    expect(r.consentRequired).toBe(false);
  });

  it('HITL_CONSENT alone -> consentRequired only', () => {
    const r = classifyObligations([{ type: 'HITL_CONSENT' }]);
    expect(r.consentRequired).toBe(true);
    expect(r.hitlRequired).toBe(false);
    expect(r.stepUpRequired).toBe(false);
  });

  it('generic HITL alone -> hitlRequired only', () => {
    const r = classifyObligations([{ type: 'HITL' }]);
    expect(r.hitlRequired).toBe(true);
    expect(r.consentRequired).toBe(false);
    expect(r.stepUpRequired).toBe(false);
  });

  it('STEP_UP + HITL_CONSENT -> step-up wins, ONLY stepUpRequired true', () => {
    // This is the parity-critical case: a $600 transfer matches both the
    // confirm and step-up thresholds. Highest gate wins — no double-gate.
    const r = classifyObligations([
      { type: 'HITL_CONSENT' },
      { type: 'STEP_UP' },
    ]);
    expect(r.stepUpRequired).toBe(true);
    expect(r.hitlRequired).toBe(false);
    expect(r.consentRequired).toBe(false);
  });

  it('consent wins over generic HITL when both present (no step-up)', () => {
    const r = classifyObligations([
      { type: 'HITL' },
      { type: 'HITL_CONSENT' },
    ]);
    expect(r.consentRequired).toBe(true);
    expect(r.hitlRequired).toBe(false);
    expect(r.stepUpRequired).toBe(false);
  });

  it('keeps the informational `classified` breakdown (education, not enforcement)', () => {
    const r = classifyObligations([
      { type: 'HITL_CONSENT' },
      { type: 'STEP_UP' },
    ]);
    // Enforcement: step-up only. Breakdown: still records both.
    expect(r.stepUpRequired).toBe(true);
    expect(r.classified.stepUp).toHaveLength(1);
    expect(r.classified.consent).toHaveLength(1);
    expect(r.classified.hitl).toHaveLength(0);
  });

  it('ignores unrecognized obligations without affecting the winner', () => {
    const r = classifyObligations([
      { type: 'LOG_ONLY' },
      { type: 'HITL_CONSENT' },
      { id: 'audit' },
    ]);
    expect(r.consentRequired).toBe(true);
    expect(r.classified.consent).toHaveLength(1);
  });
});
