import { useState, useRef, useCallback, useEffect } from "react";

// HITL_PARTICIPANTS — matches hitl-sequence.mmd participant declarations
const HITL_PARTICIPANTS = [
  { id: "B",   label: "Browser" },
  { id: "BFF", label: "BFF (demo_api_server)" },
  { id: "TC",  label: "transactionConsent.js" },
  { id: "P1",  label: "PingOne MFA" },
];

// HITL_STEPS — populated in Task 2 and Task 3
const HITL_STEPS = [];

// HITL_SCENARIOS — populated in Task 4
const HITL_SCENARIOS = {
  all:       HITL_STEPS,
  homegrown: HITL_STEPS.filter((s) => s.path === "shared" || s.path === "homegrown"),
  onetime:   HITL_STEPS.filter((s) => s.path === "shared" || s.path === "onetime"),
  device:    HITL_STEPS.filter((s) => s.path === "shared" || s.path === "device"),
};

export default function HitlSequenceDiagram() {
  return <div style={{ padding: "1rem", color: "#475569" }}>Loading…</div>;
}
