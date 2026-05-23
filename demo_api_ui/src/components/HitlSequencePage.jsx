/**
 * HitlSequencePage.jsx — /architecture/hitl
 *
 * Interactive sequence diagram for the HITL consent challenge flow.
 * Diagram and step-by-step panel are provided by HitlSequenceDiagram.js.
 * Source reference: hitl-sequence.mmd at the repo root.
 */
import HitlSequenceDiagram from "./HitlSequenceDiagram";

const PATHS = [
  { key: "homegrown", label: "Path 1 — Homegrown OTP",              color: "rgb(232,245,233)", desc: "BFF-generated HMAC OTP emailed directly. Feature flag: mode=homegrown." },
  { key: "onetime",   label: "Path 2 — PingOne One-Time (default)", color: "rgb(232,240,255)", desc: "PingOne sends OTP to user's email/phone on file. No enrolled device required. Feature flag: mode=onetime." },
  { key: "device",    label: "Path 3 — PingOne Device Picker",      color: "rgb(255,243,224)", desc: "User picks from enrolled devices (EMAIL, SMS, FIDO2). Requires amount >= $500. Feature flag: mode=device_picker." },
];

export default function HitlSequencePage() {
  return (
    <div style={{ padding: "2rem", maxWidth: "100%", overflowX: "auto" }}>
      <header style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#6b7280", marginBottom: "0.25rem" }}>
          HITL Consent Challenge
        </p>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", margin: 0 }}>
          Sequence Diagram — All Paths
        </h1>
        <p style={{ color: "#6b7280", marginTop: "0.5rem", fontSize: "0.9rem" }}>
          Full request/response flow for the three HITL consent modes. Controlled by{" "}
          <code style={{ background: "#f3f4f6", padding: "0.1em 0.3em", borderRadius: 4 }}>hitl_consent_mfa_mode</code>{" "}
          config flag.
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {PATHS.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "0.6rem 0.9rem", maxWidth: 280 }}>
            <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: p.color, flexShrink: 0, marginTop: 3 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827" }}>{p.label}</div>
              <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: 2 }}>{p.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <HitlSequenceDiagram />
    </div>
  );
}
