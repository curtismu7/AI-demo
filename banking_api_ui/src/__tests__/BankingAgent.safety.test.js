/**
 * Safety-fix regression tests for BankingAgent.
 * These assert the invariants fixed in docs/superpowers/plans/2026-05-18-banking-agent-safety-fixes.md
 * They intentionally test small pure helpers extracted from the component so they
 * are fast and do not require mounting the 357KB component.
 */
import {
  claimPendingNl,
  clampPanelPosition,
  makeReentrancyGuard,
} from "../components/bankingAgentSafety";

describe("claimPendingNl — atomic single-fire post-OAuth replay (Task 1)", () => {
  beforeEach(() => {
    const store = {};
    global.sessionStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    };
  });

  test("returns the stored value and removes it in one call", () => {
    sessionStorage.setItem("bx_agent_pending_nl", "transfer $50 to savings");
    const first = claimPendingNl("bx_agent_pending_nl");
    expect(first).toBe("transfer $50 to savings");
    expect(sessionStorage.getItem("bx_agent_pending_nl")).toBeNull();
  });

  test("a second concurrent claim gets null (no double replay)", () => {
    sessionStorage.setItem("bx_agent_pending_nl", "transfer $50 to savings");
    const a = claimPendingNl("bx_agent_pending_nl");
    const b = claimPendingNl("bx_agent_pending_nl");
    expect(a).toBe("transfer $50 to savings");
    expect(b).toBeNull();
  });

  test("returns null and does not throw when storage is unavailable", () => {
    global.sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(claimPendingNl("bx_agent_pending_nl")).toBeNull();
  });
});

describe("clampPanelPosition — off-screen recovery bounds", () => {
  const panel = { width: 620, height: 540 };
  const vp = { width: 1280, height: 800 };

  test("position fully inside viewport is unchanged", () => {
    expect(clampPanelPosition({ x: 100, y: 100 }, panel, vp)).toEqual({
      x: 100,
      y: 100,
    });
  });

  test("dragged past the right edge keeps a 48px strip visible", () => {
    const r = clampPanelPosition({ x: 5000, y: 200 }, panel, vp);
    expect(r.x).toBe(1280 - 48);
    expect(r.y).toBe(200);
  });

  test("dragged above the top is clamped to y=0", () => {
    const r = clampPanelPosition({ x: 100, y: -400 }, panel, vp);
    expect(r.y).toBe(0);
  });

  test("dragged off the left keeps >=48px of panel on screen", () => {
    const r = clampPanelPosition({ x: -5000, y: 100 }, panel, vp);
    expect(r.x).toBe(48 - panel.width);
    expect(r.x + panel.width).toBe(48);
  });

  test("window shrunk below panel position reclamps inward", () => {
    const small = { width: 360, height: 640 };
    const r = clampPanelPosition({ x: 1000, y: 700 }, panel, small);
    expect(r.x).toBe(360 - 48);
    expect(r.y).toBe(640 - 48);
  });
});

describe("makeReentrancyGuard — single in-flight send (Task 2)", () => {
  test("second acquire while held returns false", () => {
    const g = makeReentrancyGuard();
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
    g.release();
    expect(g.tryAcquire()).toBe(true);
  });

  test("release is idempotent and safe when not held", () => {
    const g = makeReentrancyGuard();
    expect(() => g.release()).not.toThrow();
    expect(g.tryAcquire()).toBe(true);
  });

  test("guard is released even when the guarded fn throws", async () => {
    const g = makeReentrancyGuard();
    const run = async () => {
      if (!g.tryAcquire()) return "blocked";
      try {
        return await Promise.reject(new Error("boom"));
      } finally {
        g.release();
      }
    };
    await expect(run()).rejects.toThrow("boom");
    expect(g.tryAcquire()).toBe(true); // not stuck held
  });
});
