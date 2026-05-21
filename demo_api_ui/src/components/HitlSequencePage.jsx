/**
 * HitlSequencePage.jsx — /architecture/hitl
 *
 * Live Mermaid render of the HITL consent challenge sequence diagram.
 * Source mirrors hitl-sequence.mmd at the repo root.
 */
import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

const MERMAID_SOURCE = `sequenceDiagram
    participant B as Browser
    participant BFF as BFF (demo_api_server)
    participant TC as transactionConsentChallenge.js
    participant P1 as PingOne MFA

    Note over B,P1: ALL PATHS start here — 428 gate enforces consent requirement
    B->>BFF: POST /api/transactions (transfer, or withdrawal/deposit >= $250)
    BFF-->>B: 428 Precondition Required
    B->>BFF: POST /consent-challenge { type, amount, fromAccountId, ... }
    BFF->>TC: createChallenge()
    BFF-->>B: 201 { challengeId, expiresAt, snapshot }
    Note over B: User reviews details in TransactionConsentModal and ticks consent checkbox

    rect rgb(232, 245, 233)
        Note over B,TC: PATH 1 — mode = homegrown (BFF-generated OTP, any amount)
        B->>BFF: POST /consent-challenge/:id/confirm
        BFF->>TC: confirmChallenge() — mode=homegrown — generates OTP, stores HMAC hash
        BFF-->>B: 200 { otpSent: true, otpExpiresAt }
        Note over B: User enters 6-digit OTP from email
        B->>BFF: POST /consent-challenge/:id/verify-otp { otp }
        BFF->>TC: verifyOtp() — timingSafeEqual(hash) — status = confirmed
        BFF-->>B: 200 { challengeId, confirmExpiresAt }
        B->>BFF: POST /api/transactions { consentChallengeId }
        BFF->>TC: verifyAndConsumeChallenge() — snapshot match, one-time use
        BFF-->>B: 200 transaction result
    end

    rect rgb(232, 240, 255)
        Note over B,P1: PATH 2 — mode = onetime (DEFAULT) — PingOne sends OTP, no device enrollment needed
        B->>BFF: POST /consent-challenge/:id/confirm
        BFF->>TC: confirmChallenge() — mode=onetime — getPingOneUserContact(userId)
        BFF->>P1: GET /environments/{envId}/users/{userId} (worker token)
        P1-->>BFF: { email, mobilePhone }
        BFF->>P1: POST /environments/{envId}/deviceAuthentications (user token)
        P1-->>BFF: { id: daId, status: OTP_REQUIRED, maskedContact }
        BFF->>TC: ch.oneTimePath=true, ch.daId stored in session
        BFF-->>B: 200 { otpSent: true, otpExpiresAt, maskedContact }
        Note over B: User enters 6-digit OTP sent to maskedContact
        B->>BFF: POST /consent-challenge/:id/verify-otp { otp }
        BFF->>TC: verifyMfa() — getChallengePath() = onetime
        BFF->>P1: POST /deviceAuthentications/{daId} — otp.check (worker token)
        P1-->>BFF: { status: COMPLETED }
        BFF->>TC: status = confirmed
        BFF-->>B: 200 { challengeId, confirmExpiresAt }
        B->>BFF: POST /api/transactions { consentChallengeId }
        BFF->>TC: verifyAndConsumeChallenge() — snapshot match, one-time use
        BFF-->>B: 200 transaction result
    end

    rect rgb(255, 243, 224)
        Note over B,P1: PATH 3 — mode = device_picker, amount >= confirm_stepup_threshold_usd ($500)
        B->>BFF: POST /consent-challenge/:id/confirm
        BFF->>TC: confirmChallenge() — mode=device_picker + amount >= $500
        BFF->>P1: POST /environments/{envId}/users/{userId}/deviceAuthentications (user token)
        P1-->>BFF: { id: daId, status: DEVICE_SELECTION_REQUIRED, devices: [...] }
        BFF->>TC: ch.mfaPath=true, ch.daId, ch.devices stored in session
        BFF-->>B: 200 { mfaRequired: true, devices: [{ id, type, maskedContact }] }
        Note over B: User sees device picker — selects enrolled device (EMAIL, SMS, FIDO2, etc.)
        B->>BFF: POST /consent-challenge/:id/select-device { deviceId }
        BFF->>TC: selectMfaDevice() — mfaService.selectDevice(daId, deviceId)
        BFF->>P1: POST /deviceAuthentications/{daId} — device.select (worker token)
        P1-->>BFF: { status: OTP_REQUIRED | ASSERTION_REQUIRED }
        BFF-->>B: 200 { otpSent: true }
        Note over B: User enters OTP from selected device (or completes FIDO2 gesture)
        B->>BFF: POST /consent-challenge/:id/verify-otp { deviceId, otp }
        BFF->>TC: verifyMfa() — getChallengePath() = mfa
        BFF->>P1: mfaService.submitOtp(daId, deviceId, otp) — worker token
        P1-->>BFF: { status: COMPLETED }
        BFF->>TC: status = confirmed
        BFF-->>B: 200 { challengeId, confirmExpiresAt }
        B->>BFF: POST /api/transactions { consentChallengeId }
        BFF->>TC: verifyAndConsumeChallenge() — snapshot match, one-time use
        BFF-->>B: 200 transaction result
    end

    Note over B,TC: OTP 123123 bypasses PingOne in paths 2 and 3 for demo environments`;

const PATHS = [
  { key: "homegrown", label: "Path 1 — Homegrown OTP", color: "rgb(232,245,233)", desc: "BFF-generated HMAC OTP emailed directly. Feature flag: mode=homegrown." },
  { key: "onetime",   label: "Path 2 — PingOne One-Time OTP (default)", color: "rgb(232,240,255)", desc: "PingOne sends OTP to user's email/phone on file. No enrolled device required. Feature flag: mode=onetime." },
  { key: "device",    label: "Path 3 — PingOne Device Picker", color: "rgb(255,243,224)", desc: "User picks from enrolled devices (EMAIL, SMS, FIDO2). Requires amount >= $500. Feature flag: mode=device_picker." },
];

export default function HitlSequencePage() {
  const containerRef = useRef(null);
  const [renderError, setRenderError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "loose",
      sequence: { useMaxWidth: true, wrap: true },
    });

    async function render() {
      try {
        const { svg } = await mermaid.render("hitl-sequence-svg", MERMAID_SOURCE);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) setRenderError(err?.message || "Mermaid render failed");
      }
    }
    render();
    return () => { cancelled = true; };
  }, []);

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

      {renderError ? (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "1rem", color: "#991b1b" }}>
          <strong>Render error:</strong> {renderError}
        </div>
      ) : (
        <div ref={containerRef} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "1.5rem", overflowX: "auto" }} />
      )}
    </div>
  );
}
