// banking_api_ui/src/components/TokenChainDisplay.js
import React, { useState, useCallback, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { useTokenChainOptional } from "../context/TokenChainContext";
import { useEducationUIOptional } from "../context/EducationUIContext";
import { useDraggablePanel } from "../hooks/useDraggablePanel";
import "./TokenChainDisplay.css";
import {
  deriveTokenCategory,
  TokenColorDot,
  TokenColorLegend,
  getTokenColor,
} from "./TokenColorSystem";
// Phase 266 R3 — spec-citation pills (educational/teaching demo). Runs offline.
import { SPEC_GUIDE } from "./specGuide";
import TokenCard from "./TokenCard";
import { isEducationalPath } from "../utils/educationalPages";

const FETCH_COOLDOWN_MS = 5000; // Don't fetch more than once per 5 seconds

// ─── RFC link helper ──────────────────────────────────────────────────────────

const RFC_URLS = {
  6749: "https://www.rfc-editor.org/rfc/rfc6749",
  7009: "https://www.rfc-editor.org/rfc/rfc7009",
  7515: "https://www.rfc-editor.org/rfc/rfc7515",
  7517: "https://www.rfc-editor.org/rfc/rfc7517",
  7518: "https://www.rfc-editor.org/rfc/rfc7518",
  7519: "https://www.rfc-editor.org/rfc/rfc7519",
  7636: "https://www.rfc-editor.org/rfc/rfc7636",
  7662: "https://www.rfc-editor.org/rfc/rfc7662",
  8693: "https://www.rfc-editor.org/rfc/rfc8693",
  8705: "https://www.rfc-editor.org/rfc/rfc8705",
  8707: "https://www.rfc-editor.org/rfc/rfc8707",
  9068: "https://www.rfc-editor.org/rfc/rfc9068",
  9396: "https://www.rfc-editor.org/rfc/rfc9396",
  9449: "https://www.rfc-editor.org/rfc/rfc9449",
  9470: "https://www.rfc-editor.org/rfc/rfc9470",
};

/**
 * Renders an RFC reference string (e.g. "RFC 8693 §4.1 · RFC 8707") as
 * clickable links to rfc-editor.org, preserving section numbers and separators.
 */
function RfcRef({ rfc, className = "tcd-edu-ref" }) {
  const parts = rfc.split(" · ");
  const nodes = [];
  parts.forEach((part) => {
    const match = part.match(/^(RFC\s+(\d+))(.*)/);
    if (match) {
      const [, rfcPrefix, num, rest] = match;
      const url = RFC_URLS[num];
      const label = `${rfcPrefix}${rest}`;
      nodes.push(
        url ? (
          <a
            key={part}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="tcd-rfc-ref-link"
          >
            {label}
          </a>
        ) : (
          <span key={part}>{label}</span>
        ),
      );
    } else {
      nodes.push(<span key={part}>{part}</span>);
    }
    if (nodes.length < parts.length * 2 - 1)
      nodes.push(<span key={`sep-${part}`}> · </span>);
  });
  return <span className={className}>{nodes}</span>;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

// Every status the BFF + gateway can emit, mapped to one of the four existing
// visual buckets (active/exchanged/skipped/failed/waiting). The critical
// invariant: any negative/terminal-failure status MUST resolve to the red
// "failed" bucket — previously unmapped statuses (success, failure, error,
// denied, expired, timeout, unreachable, deny, degraded, indeterminate,
// unconfigured) all fell through to the benign amber "waiting", rendering a
// failed exchange or a denied authorize decision as if it were still in
// progress. Keys are lower-cased before lookup.
const STATUS_VISUAL = {
  // success-ish
  active: { bucket: "active", label: "Active" },
  acquired: { bucket: "active", label: "Active" },
  success: { bucket: "active", label: "Success" },
  ok: { bucket: "active", label: "OK" },
  permit: { bucket: "active", label: "Permit" },
  // exchange-ish
  exchanged: { bucket: "exchanged", label: "Exchanged" },
  cached: { bucket: "exchanged", label: "Cached (no round-trip)" },
  // in-progress
  acquiring: { bucket: "acquiring", label: "Acquiring…" },
  pending: { bucket: "acquiring", label: "Pending…" },
  waiting: { bucket: "waiting", label: "Waiting" },
  // neutral / not-applicable
  skipped: { bucket: "skipped", label: "Skipped" },
  synthesized: { bucket: "skipped", label: "Synthesized (not verified)" },
  // failures — all must be red
  failed: { bucket: "failed", label: "Failed" },
  failure: { bucket: "failed", label: "Failed" },
  error: { bucket: "failed", label: "Error" },
  denied: { bucket: "failed", label: "Denied" },
  deny: { bucket: "failed", label: "Denied" },
  expired: { bucket: "failed", label: "Expired" },
  timeout: { bucket: "failed", label: "Timed out" },
  unreachable: { bucket: "failed", label: "Unreachable" },
  unconfigured: { bucket: "failed", label: "Not configured" },
  // ambiguous-but-not-success → treat as a warning failure, never green
  degraded: { bucket: "failed", label: "Degraded" },
  warning: { bucket: "failed", label: "Warning" },
  indeterminate: { bucket: "failed", label: "Indeterminate" },
};

// Resolve any status string to a known visual bucket. Unknown → "failed"
// (fail loud, never silently benign) so a new server status can't masquerade
// as success.
function resolveStatusVisual(status) {
  const key = typeof status === "string" ? status.toLowerCase().trim() : "";
  if (STATUS_VISUAL[key]) return STATUS_VISUAL[key];
  return { bucket: "failed", label: status ? String(status) : "Unknown" };
}

function StatusBadge({ status }) {
  const { bucket, label } = resolveStatusVisual(status);
  const spinning = bucket === "acquiring";
  return (
    <span className={`tcd-badge tcd-badge--${bucket}`}>
      {spinning ? <span className="tcd-spinner"></span> : null}
      {label}
    </span>
  );
}

// ─── Claims viewer ────────────────────────────────────────────────────────────

function ClaimsPanel({ claims, alg }) {
  if (!claims) {
    return <p className="tcd-no-claims">No decoded claims available.</p>;
  }

  const highlight = (key) => {
    if (key === "may_act") {
      return "tcd-claim--may-act";
    }
    if (key === "act") {
      return "tcd-claim--act";
    }
    if (key === "scope") {
      return "tcd-claim--scope";
    }
    if (key === "aud") {
      return "tcd-claim--aud";
    }
    return "";
  };

  /** Human-readable label for well-known JWT / RFC 8693 claims. */
  const claimLabel = (key) => {
    if (key === "sub") {
      return "sub — User ID";
    }
    if (key === "act") {
      return "act — Delegation (Agent)";
    }
    if (key === "may_act") {
      return "may_act — Permitted Agent";
    }
    if (key === "iss") {
      return "iss — Issuer";
    }
    if (key === "aud") {
      return "aud — Audience";
    }
    if (key === "exp") {
      return "exp — Expires";
    }
    if (key === "iat") {
      return "iat — Issued At";
    }
    if (key === "nbf") {
      return "nbf — Not Before";
    }
    if (key === "scope") {
      return "scope — Scopes";
    }
    return key;
  };

  const claimTooltip = (key) => {
    if (key === "aud") {
      return "Audience — which resource server accepts this token (RFC 8693 §3)";
    }
    if (key === "act") {
      return "Delegation chain — which agent is acting on behalf of the user (RFC 8693 §4.1)";
    }
    if (key === "sub") {
      return "Subject — the human user this token represents";
    }
    if (key === "scope") {
      return "Authorized scopes for this audience";
    }
    if (key === "may_act") {
      return "Permitted actor — pre-authorises delegation at login time (RFC 8693 §4.1)";
    }
    return undefined;
  };

  const fmtVal = (key, val) => {
    if (typeof val === "object") {
      return JSON.stringify(val, null, 2);
    }
    if (key === "exp" || key === "iat" || key === "nbf") {
      const d = new Date(val * 1000);
      return `${val}  (${d.toLocaleTimeString()})`;
    }
    return String(val);
  };

  return (
    <div className="tcd-claims">
      {alg && <div className="tcd-claims-alg">alg: {alg}</div>}
      {Object.entries(claims).map(([k, v]) => (
        <div key={k} className={`tcd-claim ${highlight(k, v)}`}>
          <span className="tcd-claim-key" title={claimTooltip(k)}>
            {claimLabel(k)}
          </span>
          <span className="tcd-claim-sep">:</span>
          {k === "act" && v && typeof v === "object" && v.sub && (
            <span className="tcd-claim-agent-id"> Agent ID: {v.sub}</span>
          )}
          <pre className="tcd-claim-val">{fmtVal(k, v)}</pre>
        </div>
      ))}
    </div>
  );
}

// ─── Educational boxes ─────────────────────────────────────────────────────

/**
 * Shown when an educational section does not apply to the current token event.
 * If the section is RFC-defined, shows a brief RFC description below the note.
 */
function NotApplicableNote({ rfc, rfcDesc }) {
  return (
    <div className="tcd-edu-na">
      <span className="tcd-edu-na-msg">Not applicable to this token</span>
      {rfc && rfcDesc && (
        <span className="tcd-edu-na-rfc">
          <RfcRef rfc={rfc} className="tcd-edu-na-rfc-tag" />
          {rfcDesc}
        </span>
      )}
    </div>
  );
}

/**
 * Rich educational callout for the may_act claim (RFC 8693 §4.1).
 * Shows valid / mismatch / absent states with fix steps. Renders on user-token events.
 */
function MayActEduBox({ event }) {
  const { mayActPresent, mayActValid, mayActDetails } = event;
  if (mayActPresent === undefined)
    return (
      <NotApplicableNote
        rfc="RFC 8693 §4.1"
        rfcDesc="Token Exchange delegation permission. Pre-authorises a specific OAuth client to exchange this token on the resource owner's behalf, enabling delegated agent access."
      />
    );
  const mayActValue = event.claims?.may_act;

  if (mayActPresent && mayActValid) {
    return (
      <div className="tcd-edu-box tcd-edu-box--ok">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">✅</span>
          <strong>may_act — delegation permission granted</strong>
          <RfcRef rfc="RFC 8693 §4.1" />
        </div>
        {mayActValue && (
          <pre className="tcd-edu-code">
            {JSON.stringify({ may_act: mayActValue }, null, 2)}
          </pre>
        )}
        <div className="tcd-edu-body">
          <p>
            This claim pre-authorises the BFF to exchange this token on the
            user's behalf. PingOne validates it during RFC 8693 Token Exchange.
          </p>
          <ul>
            <li>
              <code>client_id</code> must equal the BFF OAuth app client ID — ✅
              matches
            </li>
            <li>
              BFF presents its own credentials as <code>actor_token</code>
            </li>
            <li>
              PingOne issues an MCP token with an <code>act</code> claim (the
              delegation fact)
            </li>
          </ul>
          {mayActDetails && <p className="tcd-edu-detail">{mayActDetails}</p>}
        </div>
      </div>
    );
  }

  if (mayActPresent && !mayActValid) {
    return (
      <div className="tcd-edu-box tcd-edu-box--error">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">❌</span>
          <strong>may_act — client_id mismatch</strong>
          <RfcRef rfc="RFC 8693 §4.1" />
        </div>
        {mayActValue && (
          <pre className="tcd-edu-code">
            {JSON.stringify({ may_act: mayActValue }, null, 2)}
          </pre>
        )}
        <div className="tcd-edu-body">
          <p>
            The claim is present but <code>may_act.client_id</code> does not
            match this BFF's OAuth app. PingOne will reject the RFC 8693
            exchange.
          </p>
          {mayActDetails && (
            <p className="tcd-edu-detail">❌ {mayActDetails}</p>
          )}
        </div>
        <div className="tcd-edu-fix">
          <strong>Fix:</strong> In PingOne → token policy, update the{" "}
          <code>may_act</code> expression to reference your BFF client ID, then
          sign out and sign in again.
        </div>
      </div>
    );
  }

  // absent
  return (
    <div className="tcd-edu-box tcd-edu-box--warn">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">⚠️</span>
        <strong>may_act absent — exchange may fail</strong>
        <RfcRef rfc="RFC 8693 §4.1" />
      </div>
      <div className="tcd-edu-body">
        <p>
          The user token has no <code>may_act</code> claim. The RFC 8693 Token
          Exchange will be attempted — whether PingOne accepts it depends on
          your token policy. Without <code>may_act</code>, PingOne may reject
          the exchange.
        </p>
        <p>
          <strong>may_act</strong> is a prospective permission: it
          pre-authorises the BFF to exchange this token. It must be added by
          PingOne at login time via a token policy expression.
        </p>
        <div className="tcd-edu-steps">
          <strong>Fix steps:</strong>
          <ol>
            <li>
              Go to <strong>/demo-data</strong> → click{" "}
              <strong>Enable may_act</strong>
            </li>
            <li>
              Sign out and sign in again (the token is only updated at login)
            </li>
            <li>Re-run the tool — this row will show ✅ may_act valid</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * Rich educational callout for the act claim (RFC 8693 §4.4).
 * Shows delegation proven / absent states. Renders on MCP token events.
 */
function ActEduBox({ event }) {
  if (event.actPresent === undefined)
    return (
      <NotApplicableNote
        rfc="RFC 8693 §4.4"
        rfcDesc="Actor claim — the current delegation fact. Identifies which client is actively acting on behalf of the subject, providing a cryptographically-bound audit trail in the exchanged token."
      />
    );
  const actValue = event.claims?.act;

  if (event.actPresent) {
    return (
      <div className="tcd-edu-box tcd-edu-box--ok">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">✅</span>
          <strong>act — delegation chain proven (current actor)</strong>
          <RfcRef rfc="RFC 8693 §4.4" />
        </div>
        {actValue && (
          <pre className="tcd-edu-code">
            {JSON.stringify({ act: actValue }, null, 2)}
          </pre>
        )}
        <div className="tcd-edu-body">
          <p>
            <code>act</code> is the <em>current delegation fact</em>. Compare
            with <code>may_act</code> on the user token:
          </p>
          <ul>
            <li>
              <code>may_act</code> (user token) — <em>prospective:</em> "this
              client is allowed to act"
            </li>
            <li>
              <code>act</code> (MCP token) — <em>current fact:</em> "this client
              IS acting right now"
            </li>
          </ul>
          <p>
            The MCP server validates <code>act.client_id</code> to confirm the
            BFF — not any random client — made this call, establishing a
            verifiable audit trail.
          </p>
          {event.actDetails && (
            <p className="tcd-edu-detail">
              ✅ {event.actDetails} — BFF is confirmed current actor
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tcd-edu-box tcd-edu-box--warn">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">⚠️</span>
        <strong>act absent — delegation not proven in MCP token</strong>
        <RfcRef rfc="RFC 8693 §4.4" />
      </div>
      <div className="tcd-edu-body">
        <p>
          The MCP token has no <code>act</code> claim. The exchange ran, but
          PingOne did not include delegation evidence. The MCP server and audit
          logs cannot confirm which client acted.
        </p>
        <p>
          <strong>Typical cause:</strong> exchange ran without an{" "}
          <code>actor_token</code> (subject-only mode). Set{" "}
          <code>AGENT_OAUTH_CLIENT_ID</code> +{" "}
          <code>AGENT_OAUTH_CLIENT_SECRET</code> for full on-behalf-of
          semantics.
        </p>
      </div>
    </div>
  );
}

/**
 * Rich educational callout for the aud (audience) claim (RFC 7519 §4.1.3, RFC 8707).
 * Three contexts:
 *   user-token:           broad aud from PingOne (informational)
 *   exchange-in-progress: explains audience= parameter → RFC 8707 resource indicator
 *   exchanged-token:      aud narrowed to mcp_resource_uri — validate match
 */
function AudienceEduBox({ event }) {
  const audValue = event.claims?.aud;

  // ── User token: informational aud explanation ─────────────────────────────
  if (event.id === "user-token") {
    if (!audValue)
      return (
        <NotApplicableNote
          rfc="RFC 7519 §4.1.3"
          rfcDesc="The aud (audience) claim identifies the intended recipients of a token. A resource server must reject any token whose aud does not include its own identifier."
        />
      );
    const audDisplay = Array.isArray(audValue)
      ? audValue.join(", ")
      : String(audValue);
    return (
      <div className="tcd-edu-box tcd-edu-box--neutral">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">🎯</span>
          <strong>
            aud — audience (which resource server accepts this token)
          </strong>
          <RfcRef rfc="RFC 7519 §4.1.3" />
        </div>
        <pre className="tcd-edu-code">
          {JSON.stringify({ aud: audValue }, null, 2)}
        </pre>
        <div className="tcd-edu-body">
          <p>
            <code>aud</code> identifies the intended recipient(s) of the token.
            A resource server <strong>must reject</strong> any token whose{" "}
            <code>aud</code> does not include its own identifier.
          </p>
          <ul>
            <li>
              Current value: <strong>{audDisplay}</strong> — this token is
              accepted by the banking API
            </li>
            <li>
              After RFC 8693 exchange, <code>aud</code> is <em>narrowed</em> to
              the MCP server audience only (principle of least privilege)
            </li>
            <li>
              The MCP server will reject the user token directly — it only
              accepts tokens with its own audience
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // ── Exchange-in-progress / exchange-failed: explain audience= parameter ──
  if (event.id === "exchange-in-progress" || event.id === "exchange-failed") {
    const requestedAud = event.exchangeRequest?.audience;
    const failed = event.id === "exchange-failed";
    return (
      <div
        className={`tcd-edu-box ${failed ? "tcd-edu-box--error" : "tcd-edu-box--neutral"}`}
      >
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">{failed ? "❌" : "🎯"}</span>
          <strong>audience= parameter — RFC 8707 Resource Indicator</strong>
          <RfcRef rfc="RFC 8707" />
        </div>
        {requestedAud && (
          <pre className="tcd-edu-code">
            {JSON.stringify({ audience: requestedAud }, null, 2)}
          </pre>
        )}
        <div className="tcd-edu-body">
          <p>
            The <code>audience</code> parameter in the token exchange request is
            a <strong>Resource Indicator</strong> (RFC 8707). It tells PingOne:
          </p>
          <ul>
            <li>
              <em>
                "Issue a token whose <code>aud</code> is{" "}
                <code>{requestedAud || "not set"}</code>"
              </em>
            </li>
            <li>
              Only a registered PingOne Resource Server with this audience will
              be accepted
            </li>
            <li>
              Scopes are automatically narrowed to only what that Resource
              Server defines
            </li>
          </ul>
          {!requestedAud && (
            <div className="tcd-edu-fix">
              <strong>Fix:</strong> Set <code>mcp_resource_uri</code> in Config
              UI (or <code>MCP_RESOURCE_URI</code> env) to the MCP Resource
              Server audience — e.g. <code>banking_mcp_server</code>.
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Exchanged MCP token: validate aud was narrowed correctly ──────────────
  if (
    event.id === "exchanged-token" ||
    event.id === "exchanged-token-fallback"
  ) {
    if (audValue === undefined && event.audExpected === undefined)
      return (
        <NotApplicableNote
          rfc="RFC 8707 · RFC 7519 §4.1.3"
          rfcDesc="RFC 8707 Resource Indicators allow requesting a token scoped to a specific resource server. The aud claim is narrowed to that server's identifier, enforcing least-privilege access."
        />
      );
    const audDisplay = Array.isArray(audValue)
      ? audValue.join(", ")
      : audValue
        ? String(audValue)
        : "not present";

    if (event.audMatches) {
      return (
        <div className="tcd-edu-box tcd-edu-box--ok">
          <div className="tcd-edu-box-hd">
            <span className="tcd-edu-icon">✅</span>
            <strong>aud — audience narrowed correctly to MCP server</strong>
            <RfcRef rfc="RFC 8707 · RFC 7519 §4.1.3" />
          </div>
          <pre className="tcd-edu-code">
            {JSON.stringify({ aud: audValue }, null, 2)}
          </pre>
          <div className="tcd-edu-body">
            <p>
              The MCP token's <code>aud</code> matches the expected MCP Resource
              Server audience. This means:
            </p>
            <ul>
              <li>
                ✅ The MCP server will <strong>accept</strong> this token (aud
                matches its own identifier)
              </li>
              <li>
                ✅ The banking API will <strong>reject</strong> this token
                (wrong audience — prevents token reuse)
              </li>
              <li>
                ✅ Audience narrowing enforces <strong>least privilege</strong>{" "}
                — one token, one service
              </li>
            </ul>
            <p className="tcd-edu-detail">
              aud: {audDisplay} ✅ matches expected: {event.audExpected}
            </p>
          </div>
        </div>
      );
    }

    // aud mismatch or absent
    return (
      <div className="tcd-edu-box tcd-edu-box--error">
        <div className="tcd-edu-box-hd">
          <span className="tcd-edu-icon">❌</span>
          <strong>aud mismatch — MCP server will reject this token</strong>
          <RfcRef rfc="RFC 8707 · RFC 7519 §4.1.3" />
        </div>
        {audValue && (
          <pre className="tcd-edu-code">
            {JSON.stringify({ aud: audValue }, null, 2)}
          </pre>
        )}
        <div className="tcd-edu-body">
          <p>
            The token's <code>aud</code> (<strong>{audDisplay}</strong>) does
            not match the requested audience (
            <strong>{event.audExpected}</strong>).
          </p>
          <p>
            The MCP server validates <code>aud</code> on every request and will
            return 401 Unauthorized.
          </p>
        </div>
        <div className="tcd-edu-fix">
          <strong>Fix:</strong> In PingOne, ensure a Resource Server exists with
          audience <code>{event.audExpected}</code> and that the token exchange
          policy maps to it. Check <code>MCP_RESOURCE_URI</code> matches the
          Resource Server audience exactly.
        </div>
      </div>
    );
  }

  return (
    <NotApplicableNote
      rfc="RFC 7519 §4.1.3 · RFC 8707"
      rfcDesc="Audience claim and Resource Indicators define the intended recipients of a token. RFC 8693 exchange narrows the audience to the MCP server, enforcing least-privilege access."
    />
  );
}

/**
 * Renders the RFC 7662 introspection result card.
 * Shows for user-token-introspection events — active, failed, or skipped.
 */
function IntrospectionEduBox({ event }) {
  if (event.id !== "user-token-introspection")
    return (
      <NotApplicableNote
        rfc="RFC 7662 §2.2"
        rfcDesc="Active-token introspection — the resource server queries the authorization server in real time to confirm whether a token is currently active, not expired, and not revoked."
      />
    );
  const result = event.extra?.introspectionResult || {};
  const status = event.eventStatus || "skipped";
  const statusMeta = {
    active: { icon: "✅", cls: "tcd-edu-box--ok", label: "Token Active" },
    failed: { icon: "❌", cls: "tcd-edu-box--error", label: "Token Inactive" },
    skipped: { icon: "⚠️", cls: "tcd-edu-box--neutral", label: "Skipped" },
  };
  const meta = statusMeta[status] || statusMeta.skipped;

  return (
    <div className={`tcd-edu-box ${meta.cls}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{meta.icon}</span>
        <strong>RFC 7662 Active-Token Introspection — {meta.label}</strong>
        <RfcRef rfc="RFC 7662 §2.2" />
      </div>
      <div className="tcd-edu-body">
        {status === "active" && (
          <>
            <p>
              PingOne confirmed the user's session token is currently{" "}
              <strong>active</strong>. This zero-trust validation fires on every
              tool call — not just login.
            </p>
            <ul>
              {result.sub && (
                <li>
                  <code>sub</code>: <strong>{result.sub}</strong>
                </li>
              )}
              {result.scope && (
                <li>
                  <code>scope</code>:{" "}
                  <code>
                    {Array.isArray(result.scope)
                      ? result.scope.join(" ")
                      : result.scope}
                  </code>
                </li>
              )}
              {result.exp && (
                <li>
                  <code>exp</code>:{" "}
                  {new Date(result.exp * 1000).toLocaleTimeString()} (UTC)
                </li>
              )}
              {result.aud && (
                <li>
                  <code>aud</code>: {String(result.aud)}
                </li>
              )}
            </ul>
            <p className="tcd-edu-detail">
              RFC 7662 §2.2: <code>active: true</code> means the token has not
              expired, has not been revoked, and is valid for the expected
              audience.
            </p>
          </>
        )}
        {status === "failed" && (
          <>
            <p>
              PingOne returned <code>active: false</code> for the session token.
              The tool call was aborted to prevent forwarding a dead token.
            </p>
            <p className="tcd-edu-detail">
              RFC 7662 §2.2: a resource server <strong>must</strong> treat
              inactive tokens as if no token was presented. The user needs to
              re-authenticate.
            </p>
            <div className="tcd-edu-fix">
              <strong>Fix:</strong> Sign out and sign in again to get a fresh
              session token.
            </div>
          </>
        )}
        {status === "skipped" && (
          <>
            <p>
              Introspection was skipped — either{" "}
              <code>PINGONE_INTROSPECTION_ENDPOINT</code> is not set, or the
              endpoint returned an unexpected error.
            </p>
            <p className="tcd-edu-detail">
              Without introspection, the BFF relies on local JWT decode only (no
              revocation check). Configure the endpoint for zero-trust
              validation on every tool call.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Renders the session-token introspection card (server.js RFC 7662 gate).
 * Shows for session-token-introspection events — active, failed, degraded, or skipped.
 */
function SessionIntrospectionEduBox({ event }) {
  if (event.id !== "session-token-introspection")
    return (
      <NotApplicableNote
        rfc="RFC 7662 §2.2"
        rfcDesc="Active-token introspection — the resource server queries the authorization server in real time to confirm whether a token is currently active, not expired, and not revoked."
      />
    );
  const result = event.extra?.introspectionResult || {};
  const status = event.eventStatus || "skipped";
  const statusMeta = {
    active: { icon: "✅", cls: "tcd-edu-box--ok", label: "Session Active" },
    failed: {
      icon: "❌",
      cls: "tcd-edu-box--error",
      label: "Session Inactive",
    },
    degraded: {
      icon: "⚠️",
      cls: "tcd-edu-box--neutral",
      label: "Degraded (endpoint error)",
    },
    skipped: {
      icon: "⏭",
      cls: "tcd-edu-box--neutral",
      label: "Not Configured",
    },
  };
  const meta = statusMeta[status] || statusMeta.skipped;

  return (
    <div className={`tcd-edu-box ${meta.cls}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{meta.icon}</span>
        <strong>RFC 7662 Session-Token Introspection — {meta.label}</strong>
        <RfcRef rfc="RFC 7662 §2.2" />
      </div>
      <div className="tcd-edu-body">
        {status === "active" && (
          <>
            <p>
              PingOne confirmed the <strong>session token</strong> (the user's
              browser session bearer) is currently <strong>active</strong> —
              before any token exchange was attempted. This is a second
              zero-trust gate on top of the per-call user-token introspection.
            </p>
            <ul>
              {result.sub && (
                <li>
                  <code>sub</code>: <strong>{result.sub}</strong>
                </li>
              )}
              {result.scope && (
                <li>
                  <code>scope</code>: <code>{result.scope}</code>
                </li>
              )}
              {result.exp && (
                <li>
                  <code>exp</code>:{" "}
                  {new Date(result.exp * 1000).toLocaleTimeString()}
                </li>
              )}
            </ul>
            <p className="tcd-edu-detail">
              RFC 7662 §2.2: <code>active: true</code> means the session has not
              expired or been revoked at the IdP.
            </p>
          </>
        )}
        {status === "failed" && (
          <>
            <p>
              PingOne returned <code>active: false</code> for the session token.
              The BFF rejected the tool call immediately — no exchange was
              attempted.
            </p>
            <p className="tcd-edu-detail">
              RFC 7662 §2.2: inactive tokens must be treated as if no token was
              presented. Sign out and sign back in to get a fresh session.
            </p>
            <div className="tcd-edu-fix">
              <strong>Fix:</strong> Sign out and sign in again.
            </div>
          </>
        )}
        {status === "degraded" && (
          <>
            <p>
              The introspection endpoint returned an error. The BFF continued in{" "}
              <strong>degraded mode</strong> — the tool call was allowed to
              proceed without session liveness confirmation.
            </p>
            <p className="tcd-edu-detail">
              This is acceptable for a demo. In production, consider failing
              closed on introspection errors.
            </p>
          </>
        )}
        {status === "skipped" && (
          <>
            <p>
              <code>PINGONE_INTROSPECTION_ENDPOINT</code> is not set. Session
              token liveness is <strong>not</strong> verified on this tool call
              — the BFF relies on the session cookie expiry only.
            </p>
            <p className="tcd-edu-detail">
              Configure the endpoint (found in your PingOne application
              settings) for zero-trust session validation on every tool call.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function KillSwitchEduBox({ event }) {
  if (event.id !== "kill-switch-activated") return null;
  return (
    <div className="tcd-edu-box tcd-edu-box--error">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">🛑</span>
        <strong>RFC 7009 Token Revocation — Emergency Stop Activated</strong>
        <RfcRef rfc="RFC 7009" />
      </div>
      <div className="tcd-edu-body">
        <p>
          Both the <strong>access token</strong> and <strong>ID token</strong>{" "}
          were immediately revoked at PingOne using the RFC 7009 Token
          Revocation endpoint. They are now permanently invalid.
        </p>
        <ul className="tcd-edu-checklist">
          <li>
            <span className="tcd-edu-check-lbl">Endpoint:</span>
            <span>
              <code>/as/revoke</code> (RFC 7009 §2) —{" "}
              <code>application/x-www-form-urlencoded</code> with{" "}
              <code>token=&lt;value&gt;</code>
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">Effect:</span>
            <span>
              Any subsequent introspection returns <code>active: false</code> —
              the token is permanently blocked
            </span>
          </li>
          {event.timeToRevokeMs != null && (
            <li>
              <span className="tcd-edu-check-lbl">Time:</span>
              <span>{event.timeToRevokeMs}ms to revoke at PingOne</span>
            </li>
          )}
          {event.reason && (
            <li>
              <span className="tcd-edu-check-lbl">Reason:</span>
              <span>{event.reason}</span>
            </li>
          )}
        </ul>
        <div className="tcd-edu-fix">
          <strong>Next step:</strong> Run <strong>Test Revocation</strong> in
          the chat to confirm the token is rejected by PingOne introspection
          end-to-end.
        </div>
      </div>
    </div>
  );
}

function IntrospectionDeniedEduBox({ event }) {
  if (event.id !== "introspection-denied") return null;
  return (
    <div className="tcd-edu-box tcd-edu-box--error">
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">❌</span>
        <strong>RFC 7662 Introspection: active: false — Token Revoked</strong>
        <RfcRef rfc="RFC 7662 §2.2" />
      </div>
      <div className="tcd-edu-body">
        <p>
          PingOne confirmed the token is <strong>no longer active</strong>. The
          authorization server rejected the request — this is the expected
          end-to-end result of STOP AGENT.
        </p>
        <ul className="tcd-edu-checklist">
          <li>
            <span className="tcd-edu-check-lbl">Response:</span>
            <span>
              <code>{'{ "active": false }'}</code> (RFC 7662 §2.2)
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">Cause:</span>
            <span>
              STOP AGENT activated RFC 7009 token revocation — the token was
              permanently invalidated at PingOne
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">RFC rule:</span>
            <span>
              A resource server <strong>must</strong> treat{" "}
              <code>active: false</code> as if no token was presented (RFC 7662
              §2.2)
            </span>
          </li>
          {event.killSwitchReason && (
            <li>
              <span className="tcd-edu-check-lbl">Reason:</span>
              <span>{event.killSwitchReason}</span>
            </li>
          )}
        </ul>
        <div className="tcd-edu-fix">
          <strong>Recovery:</strong> Sign out and sign back in to obtain a
          fresh, valid token from PingOne.
        </div>
      </div>
    </div>
  );
}

// All event IDs that carry JWKS signature verification results
const JWKS_VERIFIED_IDS = new Set([
  "exchanged-token-verified",
  "agent-actor-token-verified",
  "two-ex-agent-actor-verified",
  "two-ex-exchange1-verified",
  "two-ex-mcp-actor-verified",
  "two-ex-final-token-verified",
]);

/**
 * Renders the JWKS signature verification card.
 * Shows for any *-verified event (single exchange or 2-exchange path).
 */
function JwksVerifyEduBox({ event }) {
  if (!JWKS_VERIFIED_IDS.has(event.id))
    return (
      <NotApplicableNote
        rfc="RFC 7515 · RFC 7517 · RFC 7518"
        rfcDesc="JSON Web Signature (JWS) and JSON Web Key (JWK) — define how tokens are cryptographically signed and how resource servers verify those signatures using the IdP's published public key set."
      />
    );
  const extra = event.extra || {};
  const verified = extra.verified;
  const fallback = extra.fallbackMethod;
  const warning = extra.warning;
  const error = extra.error;
  const alg = extra.alg;
  const kid = extra.kid;

  let icon, cls, headline;
  if (verified && fallback === "jwks") {
    icon = "✅";
    cls = "tcd-edu-box--ok";
    headline = "Signature Verified via JWKS";
  } else if (verified && fallback === "introspection") {
    icon = "🔄";
    cls = "tcd-edu-box--neutral";
    headline =
      "Liveness Confirmed via RFC 7662 Introspection (JWKS unavailable)";
  } else if (warning) {
    icon = "⚠️";
    cls = "tcd-edu-box--neutral";
    headline = "Verification Warning (fail-open)";
  } else if (error) {
    icon = "❌";
    cls = "tcd-edu-box--error";
    headline = "Signature Verification Failed";
  } else {
    icon = "⏭";
    cls = "tcd-edu-box--neutral";
    headline = "Verification Skipped";
  }

  return (
    <div className={`tcd-edu-box ${cls}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{icon}</span>
        <strong>{headline}</strong>
        <RfcRef
          rfc={
            fallback === "introspection"
              ? "RFC 7662 · RFC 7515"
              : "RFC 7515 · RFC 7517 · RFC 7518"
          }
        />
      </div>
      <div className="tcd-edu-body">
        {alg && (
          <p>
            <code>alg</code>: <strong>{alg}</strong>
            {kid ? (
              <>
                {" "}
                · <code>kid</code>: <strong>{kid}</strong>
              </>
            ) : (
              ""
            )}
          </p>
        )}
        {verified && fallback === "jwks" && (
          <>
            <p>
              PingOne's public key confirmed that the MCP token's signature is
              intact — it has not been tampered with since PingOne signed it.
            </p>
            <ul>
              <li>
                The gateway fetched PingOne's JWKS (
                <code>/.well-known/jwks.json</code>) and matched the key by{" "}
                <code>kid</code>
              </li>
              <li>
                The <code>{alg}</code> signature was verified using the RSA
                public key
              </li>
              <li>This proves the token was issued by PingOne, not forged</li>
            </ul>
            <p className="tcd-edu-detail">
              RFC 7515 §4: the <code>kid</code> header identifies which key
              signed the token. RFC 7517: the public JWK set is published at the
              IdP's JWKS URI.
            </p>
          </>
        )}
        {verified && fallback === "introspection" && (
          <>
            <p>
              JWKS was unavailable, so the gateway fell back to asking PingOne
              directly (<code>active: true</code>). Cryptographic
              tamper-detection was skipped.
            </p>
            <p className="tcd-edu-detail">
              This is acceptable in a demo — the token was received directly
              from PingOne's token endpoint milliseconds ago. In production,
              JWKS verification is preferred because it is local (no network
              call) and provides tamper-evidence. Set{" "}
              <code>PINGONE_JWKS_ENDPOINT</code> for full JWKS verification.
            </p>
          </>
        )}
        {!verified && warning && <p>{warning}</p>}
        {!verified && error && (
          <>
            <p>{error}</p>
            <div className="tcd-edu-fix">
              <strong>RFC 7515 §5.2:</strong> Failed signature validation means
              the token must be rejected. This indicates tampering or a key
              mismatch.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Shows the validation checks PingOne performs during RFC 8693 exchange.
 * Renders on exchange-in-progress and exchange-failed events.
 */
function ExchangeCheckList({ event }) {
  if (event.id !== "exchange-in-progress" && event.id !== "exchange-failed")
    return (
      <NotApplicableNote
        rfc="RFC 8693 §2.1"
        rfcDesc="Token Exchange — defines how a client requests a new token by presenting an existing subject token. The authorization server validates delegation permissions before issuing a narrowed-scope token."
      />
    );
  const failed = event.id === "exchange-failed";
  const hasActorToken = event.exchangeRequest?.has_actor_token;

  return (
    <div
      className={`tcd-edu-box ${failed ? "tcd-edu-box--error" : "tcd-edu-box--neutral"}`}
    >
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{failed ? "❌" : "🔍"}</span>
        <strong>
          {failed
            ? "Exchange failed — PingOne validation"
            : "What PingOne validates during exchange"}
        </strong>
        <RfcRef rfc="RFC 8693 §2.1" />
      </div>
      <div className="tcd-edu-body">
        {failed && event.error && (
          <p className="tcd-edu-detail" style={{ marginBottom: 8 }}>
            Error: {event.error}
          </p>
        )}
        {failed && event.mayActPresent === false && (
          <p className="tcd-edu-absent-warn">
            ⚠️ may_act was absent from the user token — this is likely why
            exchange failed. Go to /demo-data → Enable may_act → re-login, then
            try again.
          </p>
        )}
        <ul className="tcd-edu-checklist">
          <li>
            <span className="tcd-edu-check-lbl">1.</span>
            <span>
              <code>may_act.client_id</code> on subject token must match the
              requesting BFF client
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">2.</span>
            <span>
              <code>audience</code> must match a registered PingOne Resource
              Server
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">3.</span>
            <span>
              Requested <code>scope</code> must be a subset of the subject
              token's scopes (PingOne narrows)
            </span>
          </li>
          {hasActorToken && (
            <li>
              <span className="tcd-edu-check-lbl">4.</span>
              <span>
                <code>actor_token</code> (client credentials) included →{" "}
                <code>act</code> claim added to the MCP token
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── TraT Context educational box ─────────────────────────────────────────────

function TratContextEduBox({ event }) {
  const [expanded, setExpanded] = React.useState(false);
  if (event.id !== "trat-context") return null;
  const ctx = event.metadata?.tratContext || {};
  const isSimulated = !!ctx.trat_sim;
  return (
    <div className={`tcd-edu-box ${isSimulated ? "tcd-edu-box--warn" : "tcd-edu-box--ok"}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{isSimulated ? "⚠️" : "✅"}</span>
        <strong>Transaction Token (TraT) Context</strong>
      </div>
      <div className="tcd-edu-body">
        <span className={`tcd-trat-badge ${isSimulated ? "simulated" : "native"}`}>
          {isSimulated ? "TraT (simulated)" : "TraT"}
        </span>
        <p style={{ marginTop: 8 }}>
          {isSimulated
            ? "TraT context forwarded as X-TraT-Context header (simulation shim). PingOne does not yet emit reqctx natively."
            : "PingOne emitted reqctx natively in the exchanged token."}
        </p>
        {Object.keys(ctx).length > 0 && (
          <>
            <button
              type="button"
              style={{ cursor: "pointer", fontSize: "0.75rem", marginTop: 4 }}
              onClick={() => setExpanded((e) => !e)}
            >
              {expanded ? "Hide claims" : "Show claims"}
            </button>
            {expanded && (
              <pre className="tcd-trat-claims-detail">
                {JSON.stringify(ctx, null, 2)}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Gateway mTLS educational box ─────────────────────────────────────────────

function GwMtlsEduBox({ event }) {
  if (event.id !== "gw-mtls") return null;
  const enabled = event.metadata?.mtlsEnabled ?? event.status === "active";
  return (
    <div className={`tcd-edu-box ${enabled ? "tcd-edu-box--ok" : "tcd-edu-box--neutral"}`}>
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">{enabled ? "✅" : "⚠️"}</span>
        <strong>Gateway → MCP Server mTLS</strong>
      </div>
      <div className="tcd-edu-body">
        <span className={`tcd-mtls-badge ${enabled ? "active" : "skipped"}`}>
          {enabled ? "mTLS active" : "mTLS disabled"}
        </span>
        <p style={{ marginTop: 8 }}>
          {event.description || (enabled
            ? "MCP server verified gateway client cert at TLS handshake."
            : "Set MCP_MTLS_ENABLED=true to enforce mTLS between gateway and MCP server.")}
        </p>
      </div>
    </div>
  );
}

// ─── Authorize Decision educational box ───────────────────────────────────────

function AuthorizeDecisionEduBox({ event }) {
  if (event.id !== "authorize-decision" && event.id !== "gw-authorize")
    return null;
  const decision = event.authorizeDecision || event.decision || "PERMIT";
  const engine =
    event.authorizeEngine ||
    (event.id === "gw-authorize" ? "pingone" : "simulated");
  const path = event.authorizePath || null;
  const decisionId = event.authorizeDecisionId || null;
  const authorizeRef = event.authorizeRef || null;
  const isPermit = decision === "PERMIT";
  const isDeny = decision === "DENY";
  return (
    <div
      className={`tcd-edu-box ${isPermit ? "tcd-edu-box--ok" : isDeny ? "tcd-edu-box--error" : "tcd-edu-box--neutral"}`}
    >
      <div className="tcd-edu-box-hd">
        <span className="tcd-edu-icon">
          {isPermit ? "✅" : isDeny ? "❌" : "⚠️"}
        </span>
        <strong>PingOne Authorize — Continuous Authorization</strong>
        <RfcRef rfc="RFC 8705" />
      </div>
      <div className="tcd-edu-body">
        <p>
          Before the agent can execute a tool, PingOne Authorize evaluates a{" "}
          <strong>policy</strong> against the request context — user identity,
          risk signals, transaction attributes, and time of day. This enforces
          Zero Trust: every action is explicitly authorized, not just the
          initial login.
        </p>
        <ul className="tcd-edu-checklist">
          <li>
            <span className="tcd-edu-check-lbl">Engine:</span>
            <span>
              {engine === "pingone"
                ? "PingOne Authorize (live policy)"
                : "Simulated policy engine (demo mode)"}
            </span>
          </li>
          <li>
            <span className="tcd-edu-check-lbl">Decision:</span>
            <span
              className={
                isPermit ? "tcd-ok-text" : isDeny ? "tcd-error-text" : ""
              }
            >
              <strong>{decision}</strong>
              {isPermit
                ? " — tool call allowed to proceed"
                : isDeny
                  ? " — tool call blocked"
                  : " — step-up or consent required"}
            </span>
          </li>
          {path && (
            <li>
              <span className="tcd-edu-check-lbl">Path:</span>
              <span>{path}</span>
            </li>
          )}
          {decisionId && (
            <li>
              <span className="tcd-edu-check-lbl">Decision ID:</span>
              <span>
                <code>{decisionId}</code>
              </span>
            </li>
          )}
          {authorizeRef && (
            <li>
              <span className="tcd-edu-check-lbl">Policy ref:</span>
              <span>
                <code>{authorizeRef}</code>
              </span>
            </li>
          )}
        </ul>
        {engine !== "pingone" && (
          <p className="tcd-edu-detail">
            Configure <code>authorize_decision_endpoint_id</code> via Setup to
            route decisions through a live PingOne Authorize policy instead of
            the simulated engine.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Event detail content (shared between inline + inspector panel) ──────────

/** Renders the full detail for a token chain event. */
function EventDetail({ event }) {
  return (
    <>
      {/* Full JWT JSON — collapsible, closed by default */}
      {event.jwtFullDecode && (
        <details className="tcd-collapsible">
          <summary className="tcd-collapsible-header">
            🔓 Full Decoded Token (JSON)
          </summary>
          <div className="tcd-collapsible-body">
            <pre className="tcd-jwt-dump">
              {JSON.stringify(event.jwtFullDecode, null, 2)}
            </pre>
          </div>
        </details>
      )}
      {/* Claims table — open by default */}
      {event.claims && (
        <details className="tcd-collapsible" open>
          <summary className="tcd-collapsible-header">
            JWT Claims (Quick Reference)
          </summary>
          <div className="tcd-collapsible-body">
            <ClaimsPanel claims={event.claims} alg={event.alg} />
          </div>
        </details>
      )}
      {event.exchangeRequest && (
        <details className="tcd-collapsible">
          <summary className="tcd-collapsible-header">
            Exchange Request (RFC 8693)
          </summary>
          <div className="tcd-collapsible-body">
            <pre className="tcd-exchange-req-pre">
              {JSON.stringify(event.exchangeRequest, null, 2)}
            </pre>
          </div>
        </details>
      )}
      {/* Educational sections — each in a collapsible, open by default */}
      <CollapsibleEdu
        title="PingOne Authorize Decision"
        event={event}
        Component={AuthorizeDecisionEduBox}
      />
      <CollapsibleEdu
        title="Audience (aud)"
        event={event}
        Component={AudienceEduBox}
      />
      <CollapsibleEdu
        title="may_act — Delegation Permission"
        event={event}
        Component={MayActEduBox}
      />
      <CollapsibleEdu
        title="act — Actor Claim"
        event={event}
        Component={ActEduBox}
      />
      <CollapsibleEdu
        title="Exchange Validation"
        event={event}
        Component={ExchangeCheckList}
      />
      <CollapsibleEdu
        title="RFC 7662 Active-Token Introspection"
        event={event}
        Component={IntrospectionEduBox}
      />
      <CollapsibleEdu
        title="RFC 7662 Session-Token Introspection"
        event={event}
        Component={SessionIntrospectionEduBox}
      />
      <CollapsibleEdu
        title="JWKS Signature Verification"
        event={event}
        Component={JwksVerifyEduBox}
      />
      {event.id === "kill-switch-activated" && (
        <CollapsibleEdu
          title="Kill Switch — RFC 7009 Token Revocation"
          event={event}
          Component={KillSwitchEduBox}
        />
      )}
      {event.id === "introspection-denied" && (
        <CollapsibleEdu
          title="Introspection Denied — active: false"
          event={event}
          Component={IntrospectionDeniedEduBox}
        />
      )}
      {event.id === "trat-context" && (
        <CollapsibleEdu
          title="Transaction Token (TraT) Context"
          event={event}
          Component={TratContextEduBox}
        />
      )}
      {event.id === "gw-mtls" && (
        <CollapsibleEdu
          title="Gateway mTLS Enforcement"
          event={event}
          Component={GwMtlsEduBox}
        />
      )}
      {event.explanation && (
        <p className="tcd-explanation">{event.explanation}</p>
      )}
    </>
  );
}

/** Wraps an edu box component in a collapsible if it renders content. */
function CollapsibleEdu({ title, event, Component }) {
  // Render to check if the component outputs anything
  const content = <Component event={event} />;
  // The edu boxes return null when not applicable — React will just skip them.
  // We wrap in a details only if the component is expected to render.
  // Since we can't pre-check without rendering, we always wrap but the component
  // itself returns null when not applicable, which collapses the details gracefully.
  return (
    <details className="tcd-collapsible" open>
      <summary className="tcd-collapsible-header">{title}</summary>
      <div className="tcd-collapsible-body">{content}</div>
    </details>
  );
}

// ─── Floating inspector panel (portal, draggable, resizable, collapsible) ────

/**
 * Opens the token event in a standalone browser window.
 * The user can move that window to any physical screen.
 */
function openInNewWindow(event) {
  const _cat = deriveTokenCategory(event.label, event.id, event.tokenType);
  const dotColor = getTokenColor(_cat) || "#6b7280";
  const fullJwtJson = event.jwtFullDecode
    ? JSON.stringify(event.jwtFullDecode, null, 2)
    : "";

  const claimsHtml = event.claims
    ? Object.entries(event.claims)
        .map(([k, v]) => {
          const highlight =
            {
              may_act: "var(--brand-navy)",
              act: "#0f766e",
              scope: "#6d28d9",
              aud: "#166534",
            }[k] || "";
          const bg = highlight ? `background:${highlight}22;` : "";
          const valStr =
            typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
          return `<div class="claim" style="${bg}">
          <span class="key">${k}</span>
          <span class="sep">:</span>
          <span class="val">${valStr}</span>
        </div>`;
        })
        .join("")
    : "";

  const exchangeHtml = event.exchangeRequest
    ? `<div class="section-title">Exchange request (RFC 8693)</div>
       <pre class="pre">${JSON.stringify(event.exchangeRequest, null, 2)}</pre>`
    : "";

  const pillHtml = [
    event.mayActPresent === true
      ? `<div class="pill pill-may">may_act ✅ present — ${event.mayActDetails}</div>`
      : "",
    event.mayActPresent === false
      ? `<div class="pill pill-warn">may_act absent — exchange may be rejected by PingOne</div>`
      : "",
    event.actPresent === true
      ? `<div class="pill pill-act">act ✅ ${event.actDetails} — BFF is current actor</div>`
      : "",
  ].join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Token Inspector — ${event.label}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:#ffffff;color:#1e293b;font:13px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:0}
    .header{background:#f8fafc;padding:14px 18px;display:flex;flex-direction:column;gap:2px;border-bottom:1px solid #e2e8f0}
    .title{font-size:1rem;font-weight:800;color:#0f172a}
    .subtitle{font-size:0.78rem;color:#475569}
    .body{padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;height:calc(100vh - 70px)}
    .section-title{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#475569;margin-top:12px;margin-bottom:6px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}
    .full-jwt{background:#f0fdfa;border:2px solid #99f6e4;border-radius:10px;padding:14px;margin-bottom:8px}
    .full-jwt .section-title{margin-top:0}
    .claims{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px;display:flex;flex-direction:column;gap:2px}
    .claim{display:flex;gap:8px;padding:4px 8px;border-radius:5px;font-size:.79rem}
    .key{color:#1e40af;font-weight:700;font-family:inherit;white-space:nowrap;min-width:100px}
    .sep{color:#94a3b8}
    .val{color:#1e293b;font-family:inherit;word-break:break-word;flex:1;white-space:pre-wrap}
    .pre{background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;font-size:.76rem;color:#065f46;white-space:pre-wrap;word-break:break-all;font-family:inherit;max-height:700px;overflow:auto;line-height:1.5}
    .pill{font-size:.75rem;font-weight:600;padding:5px 12px;border-radius:8px;width:fit-content}
    .pill-may{background:rgba(37,99,235,.08);color:#1e40af;border:1px solid rgba(37,99,235,.25)}
    .pill-act{background:rgba(20,184,166,.08);color:#0f766e;border:1px solid rgba(20,184,166,.25)}
    .pill-warn{background:rgba(239,68,68,.08);color:#b91c1c;border:1px solid rgba(239,68,68,.25)}
    .explanation{font-size:.82rem;color:#475569;line-height:1.6;margin-top:8px}
    .alg{font-size:.7rem;color:#64748b;margin-bottom:4px}
    ::-webkit-scrollbar{width:6px;height:6px}
    ::-webkit-scrollbar-track{background:#f8fafc}
    ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px}
  </style>
</head>
<body>
  <div class="header">
    <div class="title">⊕ OAuth Token Inspector</div>
    <div class="subtitle"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dotColor};margin-right:6px;vertical-align:middle"></span>${event.label}${event.status ? ` · ${event.status}` : ""}</div>
  </div>
  <div class="body">
    ${
      fullJwtJson
        ? `<div class="full-jwt">
      <div class="section-title">🔓 Full Decoded Token (JSON)</div>
      <pre class="pre">${fullJwtJson}</pre>
    </div>`
        : ""
    }
    ${
      event.claims
        ? `<div>
      ${event.alg ? `<div class="alg">alg: ${event.alg}</div>` : ""}
      <div class="section-title">Claims (Quick Reference)</div>
      <div class="claims">${claimsHtml}</div>
    </div>`
        : ""
    }
    ${exchangeHtml}
    ${pillHtml}
    ${event.explanation ? `<div class="explanation">${event.explanation}</div>` : ""}
  </div>
</body>
</html>`;

  const win = window.open(
    "",
    `tci-${event.id || "token"}-${Date.now()}`,
    `width=1040,height=960,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`,
  );
  if (!win) return; // popup blocker
  win.document.write(html);
  win.document.close();
  win.focus();
}

/**
 * Floats above the page as a draggable, resizable, collapsible inspector.
 * Rendered via createPortal into document.body so it can go off-screen.
 */
function TokenInspectorPanel({ event, initialPos, onClose }) {
  const { pos, size, handleDragStart, createResizeHandler } = useDraggablePanel(
    initialPos,
    { w: 800, h: 960 },
    { minW: 400, minH: 320, storageKey: "tci-inspector-panel" },
  );
  const [collapsed, setCollapsed] = useState(false);

  const panel = (
    <div
      className={`tci-panel${collapsed ? " tci-panel--collapsed" : ""}`}
      style={{
        left: pos.x,
        top: pos.y,
        width: size.w,
        ...(collapsed ? {} : { height: size.h }),
      }}
      role="dialog"
      aria-label="OAuth Token Inspector"
    >
      {/* Header — drag handle */}
      <div className="tci-header" onPointerDown={handleDragStart}>
        <span className="tci-header-icon" aria-hidden>
          ⊕
        </span>
        <div className="tci-header-text">
          <span className="tci-title">OAuth Token Inspector</span>
          <span className="tci-subtitle">{event.label}</span>
        </div>
        <div className="tci-header-actions">
          <button
            type="button"
            className="tci-btn"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand inspector" : "Collapse inspector"}
          >
            {collapsed ? "□" : "—"}
          </button>
          <button
            type="button"
            className="tci-btn"
            onClick={() => openInNewWindow(event)}
            title="Pop out to new window (move to any screen)"
            aria-label="Pop out to new window"
          >
            ⤢
          </button>
          <button
            type="button"
            className="tci-btn tci-btn--close"
            onClick={onClose}
            title="Close"
            aria-label="Close inspector"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body — scrollable content */}
      {!collapsed && (
        <div className="tci-body">
          <TokenCard
            decoded={{
              header: event.jwtFullDecode?.header || {},
              payload: event.jwtFullDecode?.claims || event.claims || {},
              tokenType: event.tokenType,
            }}
            title={event.label || 'Token'}
            defaultExpanded
            showHeader
            showIdentity
            showScopes
            showRaw
          />
          <EventDetail event={event} />
        </div>
      )}

      {/* Resize grip — bottom-right corner */}
      {!collapsed && (
        <div className="drp-resize-handles">
          {/* Corner handles */}
          <div
            className="drp-resize-handle drp-resize-handle--nw"
            onMouseDown={createResizeHandler("nw")}
            aria-hidden
            title="Resize from top-left"
          />
          <div
            className="drp-resize-handle drp-resize-handle--ne"
            onMouseDown={createResizeHandler("ne")}
            aria-hidden
            title="Resize from top-right"
          />
          <div
            className="drp-resize-handle drp-resize-handle--sw"
            onMouseDown={createResizeHandler("sw")}
            aria-hidden
            title="Resize from bottom-left"
          />
          <div
            className="drp-resize-handle drp-resize-handle--se"
            onMouseDown={createResizeHandler("se")}
            aria-hidden
            title="Resize from bottom-right"
          />

          {/* Edge handles */}
          <div
            className="drp-resize-handle drp-resize-handle--n"
            onMouseDown={createResizeHandler("n")}
            aria-hidden
            title="Resize from top"
          />
          <div
            className="drp-resize-handle drp-resize-handle--s"
            onMouseDown={createResizeHandler("s")}
            aria-hidden
            title="Resize from bottom"
          />
          <div
            className="drp-resize-handle drp-resize-handle--e"
            onMouseDown={createResizeHandler("e")}
            aria-hidden
            title="Resize from right"
          />
          <div
            className="drp-resize-handle drp-resize-handle--w"
            onMouseDown={createResizeHandler("w")}
            aria-hidden
            title="Resize from left"
          />
        </div>
      )}
    </div>
  );

  return ReactDOM.createPortal(panel, document.body);
}

// ─── Inspect icon SVG ────────────────────────────────────────────────────────

/** Magnifying-glass + arrow-out icon to indicate "inspect / pop out". */
// Inline inspect icon SVG to avoid React child rendering warnings

// ─── Single event row ─────────────────────────────────────────────────────────

// ---------- Inline claims strip ------------------------------------------

const CLAIMS_STRIP_IDS = new Set([
  "user-token",
  "exchanged-token",
  "agent-actor-token",
  "exchanged-token-fallback",
  "user-token-introspection",
  "exchanged-token-verified",
  "session-token-introspection",
  // 2-exchange path: all JWKS verify events
  "agent-actor-token-verified",
  "two-ex-agent-actor-verified",
  "two-ex-exchange1-verified",
  "two-ex-mcp-actor-verified",
  "two-ex-final-token-verified",
  // Gateway auth pipeline events (Phase 259)
  "gw-introspection",
  "gw-authorize",
  "gw-exchange",
  // TraT context + mTLS status badges (Phase 10)
  "gw-mtls",
  "trat-context",
]);

function fmtSub(sub, hints) {
  if (!sub) return null;
  const s = String(sub);
  if (
    hints?.currentUser?.sub &&
    s === hints.currentUser.sub &&
    hints.currentUser.name
  ) {
    return `${hints.currentUser.name} (${s.slice(0, 8)}…)`;
  }
  return s.length > 14 ? s.slice(0, 12) + "…" : s;
}
function fmtAud(aud) {
  if (!aud) return null;
  const flat = Array.isArray(aud) ? aud[aud.length - 1] : String(aud);
  return flat.split("/").pop() || flat;
}
function fmtScope(scope, injectedScopeNames) {
  if (!scope) return null;
  const s = String(scope);
  // If no injection info, return simple formatted string
  if (!injectedScopeNames || injectedScopeNames.length === 0) {
    return s.length > 60 ? s.slice(0, 58) + "…" : s;
  }
  // Return raw string — ClaimsStrip will render per-scope badges
  return s;
}
function fmtExpiry(exp) {
  if (!exp) return null;
  const secsLeft = Math.round(exp - Date.now() / 1000);
  if (secsLeft < 0) return "expired " + Math.abs(secsLeft) + "s ago";
  if (secsLeft < 60) return secsLeft + "s";
  if (secsLeft < 3600) return Math.round(secsLeft / 60) + "m";
  return Math.round(secsLeft / 3600) + "h";
}
function fmtAct(act, hints) {
  if (!act) return null;
  if (typeof act === "object") {
    if (act.client_id) {
      const known = hints?.knownClients?.[act.client_id];
      return known
        ? `${known} (${String(act.client_id).slice(0, 8)}…)`
        : act.client_id;
    }
    if (act.sub) {
      const s = String(act.sub);
      if (
        hints?.currentUser?.sub &&
        s === hints.currentUser.sub &&
        hints.currentUser.name
      ) {
        return `${hints.currentUser.name} (${s.slice(0, 8)}…)`;
      }
      return "sub:" + s.slice(0, 12) + "…";
    }
    return JSON.stringify(act).slice(0, 40);
  }
  return String(act).slice(0, 40);
}

/** Compact inline strip showing key claims without opening the inspector. */
function ClaimsStrip({ event, hints }) {
  if (!CLAIMS_STRIP_IDS.has(event.id)) return null;
  const cl = event.claims;
  if (!cl) return null;
  const sub = fmtSub(cl.sub, hints);
  const act = fmtAct(cl.act, hints);
  const mayAct =
    cl.may_act && cl.may_act.client_id ? String(cl.may_act.client_id) : null;
  const aud = fmtAud(cl.aud);
  const injectedScopeNames =
    event.injectedScopeNames || cl.injected_scope_names || [];
  const scope = fmtScope(cl.scope, injectedScopeNames);
  const expiry = fmtExpiry(cl.exp);
  const rows = [
    sub ? { key: "sub", val: sub, cls: "" } : null,
    act ? { key: "act", val: act, cls: "tcd-cs-act" } : null,
    mayAct ? { key: "may_act", val: mayAct, cls: "tcd-cs-may" } : null,
    aud ? { key: "aud", val: aud, cls: "tcd-cs-aud" } : null,
    scope
      ? { key: "scope", val: scope, cls: "tcd-cs-scope", injectedScopeNames }
      : null,
    expiry
      ? {
          key: "exp",
          val: expiry,
          cls: expiry.includes("ago") ? "tcd-cs-expired" : "",
        }
      : null,
  ].filter(Boolean);
  if (rows.length === 0) return null;
  return (
    <div className="tcd-claims-strip">
      {rows.map((r) => (
        <span
          key={r.key}
          className={"tcd-cs-item" + (r.cls ? " " + r.cls : "")}
        >
          <span className="tcd-cs-key">{r.key}</span>
          {r.key === "scope" &&
          r.injectedScopeNames &&
          r.injectedScopeNames.length > 0 ? (
            <span className="tcd-cs-val tcd-scope-badges">
              {String(r.val)
                .split(/\s+/)
                .filter(Boolean)
                .map((s, i) => (
                  <span
                    key={i}
                    className={
                      r.injectedScopeNames.includes(s)
                        ? "tcd-scope-badge tcd-scope-badge--injected"
                        : "tcd-scope-badge tcd-scope-badge--real"
                    }
                  >
                    {s}
                    {r.injectedScopeNames.includes(s) && (
                      <span className="tcd-scope-injected-tag">
                        {" "}
                        ⚡ INJECTED
                      </span>
                    )}
                  </span>
                ))}
            </span>
          ) : (
            <span className="tcd-cs-val">{r.val}</span>
          )}
        </span>
      ))}
    </div>
  );
}

const STEP_SUB_LABELS = {
  "user-token": "User Token",
  "agent-actor-token": "Actor Token",
  "exchanged-token": "MCP Token",
  "exchanged-token-fallback": "MCP Token",
  exchange: "Token Exchange",
  "exchange-in-progress": "Exchanging",
  "exchange-failed": "Exchange Failed",
};

function getStepSubLabel(eventId) {
  if (!eventId) return "Subject";
  if (Object.hasOwn(STEP_SUB_LABELS, eventId)) return STEP_SUB_LABELS[eventId];
  if (eventId.startsWith("synthetic-session")) return "Session";
  return "Subject";
}

/** Shows scope additions/removals between two consecutive token events. */
function ScopeDelta({ fromEvent, toEvent }) {
  const fromScope = fromEvent?.claims?.scope;
  const toScope = toEvent?.claims?.scope;
  if (!fromScope || !toScope) return null;
  const fromSet = new Set(String(fromScope).split(/\s+/).filter(Boolean));
  const toSet = new Set(String(toScope).split(/\s+/).filter(Boolean));
  const removed = [...fromSet].filter((s) => !toSet.has(s));
  const added = [...toSet].filter((s) => !fromSet.has(s));
  if (removed.length === 0 && added.length === 0) return null;
  return (
    <div className="tcd-scope-delta">
      <span className="tcd-scope-delta-label">Scope narrowed:</span>
      {removed.map((s) => (
        <span key={s} className="tcd-scope-delta--removed">
          - {s}
        </span>
      ))}
      {added.map((s) => (
        <span key={s} className="tcd-scope-delta--added">
          + {s}
        </span>
      ))}
    </div>
  );
}

// ─── NL Routing Card (step 0) ────────────────────────────────────────────────

const SOURCE_LABELS = {
  heuristic: {
    label: "Heuristic fast-path",
    cls: "tcd-nl-source--heuristic",
    detail: "regex pattern matched — no LLM call",
  },
  ollama: {
    label: "LLM — Ollama",
    cls: "tcd-nl-source--llm",
    detail: "local model",
  },
  helix: {
    label: "LLM — Helix",
    cls: "tcd-nl-source--llm",
    detail: "Helix AI",
  },
  helix_fallback: {
    label: "LLM — Helix (fallback)",
    cls: "tcd-nl-source--llm",
    detail: "general knowledge fallback",
  },
  nl: { label: "LLM", cls: "tcd-nl-source--llm", detail: "language model" },
};

function intentLabel(intent) {
  if (!intent) return null;
  if (intent.kind === "banking" && intent.banking?.action) {
    const a = intent.banking.action;
    const p = intent.banking.params || {};
    if (a === "transfer")
      return `transfer  $${p.amount ?? "?"} ${p.fromId ?? "?"} → ${p.toId ?? "?"}`;
    if (a === "deposit")
      return `deposit  $${p.amount ?? "?"} → ${p.toId ?? "?"}`;
    if (a === "withdraw")
      return `withdraw  $${p.amount ?? "?"} from ${p.fromId ?? "?"}`;
    if (a === "balance")
      return `balance${p.accountId ? `  (${p.accountId})` : ""}`;
    if (a === "accounts") return "accounts";
    if (a === "transactions") return "transactions";
    return `${a}`;
  }
  if (intent.kind === "education") {
    const panel = intent.education?.panel ?? (intent.ciba ? "ciba" : null);
    return panel ? `education:${panel}` : "education";
  }
  if (intent.kind === "none") return "no match";
  return intent.kind ?? null;
}

// Conservative mid-range estimate of tokens a typical NL query would consume via an LLM.
const HEURISTIC_SAVED_ESTIMATE = 400;

function NlRoutingCard({ event }) {
  if (!event) return null;
  const src = SOURCE_LABELS[event.source] || {
    label: event.source,
    cls: "tcd-nl-source--llm",
    detail: "",
  };
  const intent = intentLabel(event.intent);
  const time = event.timestamp
    ? new Date(event.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  return (
    <div className="tcd-nl-card">
      <div className="tcd-nl-card__header">
        <span className="tcd-nl-card__step">Step 0</span>
        <span className="tcd-nl-card__title">NL Intent Routing</span>
        {time && <span className="tcd-nl-card__time">{time}</span>}
      </div>
      <div className="tcd-nl-card__row">
        <span className="tcd-nl-card__key">Prompt</span>
        <span className="tcd-nl-card__val tcd-nl-card__prompt">
          {event.prompt}
        </span>
      </div>
      <div className="tcd-nl-card__row">
        <span className="tcd-nl-card__key">Routing</span>
        <span className={`tcd-nl-card__val tcd-nl-source ${src.cls}`}>
          {src.label}
          {src.detail && (
            <span className="tcd-nl-source__detail"> — {src.detail}</span>
          )}
        </span>
      </div>
      {intent && (
        <div className="tcd-nl-card__row">
          <span className="tcd-nl-card__key">Intent</span>
          <span className="tcd-nl-card__val tcd-nl-card__intent">{intent}</span>
        </div>
      )}
      {event.heuristicSaved && (
        <div className="tcd-nl-card__row">
          <span className="tcd-nl-card__key">Cost</span>
          <span className="tcd-nl-card__val tcd-nl-saved-chip">
            ~{HEURISTIC_SAVED_ESTIMATE} tokens saved (est.) — no LLM call
          </span>
        </div>
      )}
    </div>
  );
}

// ─── TLS Security Card ───────────────────────────────────────────────────────

/**
 * Standalone card explaining which hops in the token-exchange flow are
 * protected by TLS certificates. Always rendered in the "Current call" tab
 * so the demo makes the transport security layer explicit — tokens are
 * protected in transit, not just at rest in the BFF session.
 *
 * Connections shown:
 *   Browser → BFF         (mkcert — api.ping.demo:3001  HTTPS)
 *   Browser → UI          (mkcert — api.ping.demo:4000  HTTPS)
 *   BFF → PingOne AS      (public CA — auth.pingone.com  HTTPS)
 *   BFF → MCP Gateway     (mkcert — api.ping.demo:3005  HTTPS)
 *   Gateway → MCP Server  (HTTP — loopback only; no token leaves the host)
 */

const TLS_HOPS = [
  {
    from: "Browser",
    to: "BFF",
    host: "api.ping.demo:3001",
    protocol: "HTTPS",
    cert: "mkcert (dev CA)",
    note: "All API calls from the SPA go over TLS. The user's session cookie and any response data are encrypted in transit.",
  },
  {
    from: "Browser",
    to: "UI Server",
    host: "api.ping.demo:4000",
    protocol: "HTTPS",
    cert: "mkcert (dev CA)",
    note: "React app served over TLS — prevents page-load MITM that could inject scripts.",
  },
  {
    from: "BFF",
    to: "PingOne AS",
    host: "auth.pingone.com",
    protocol: "HTTPS",
    cert: "Public CA (DigiCert)",
    note: "Token endpoint, introspection, and PKCE callback use publicly-trusted TLS. Tokens are never sent in plaintext.",
  },
  {
    from: "BFF",
    to: "MCP Gateway",
    host: "api.ping.demo:3005",
    protocol: "HTTPS",
    cert: "mkcert (dev CA)",
    note: "The gateway health probe and all delegated tool calls from the BFF use HTTPS. The exchanged MCP token is protected in transit.",
  },
  {
    from: "Gateway",
    to: "MCP Server",
    host: "localhost:8080",
    protocol: "HTTP",
    cert: "None (loopback)",
    note: "Internal loopback only — traffic never leaves the host. No certificate needed; network-level isolation is the control.",
    internal: true,
  },
];

function TlsSecurityCard() {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <div className="tcd-tls-card">
      <div className="tcd-tls-card__header">
        <span className="tcd-tls-card__badge">TLS</span>
        <span className="tcd-tls-card__title">Transport Security — Certificate-protected hops</span>
        <button
          type="button"
          className="tcd-tls-card__toggle"
          onClick={() => setExpanded(e => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse TLS details" : "Expand TLS details"}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>
      <p className="tcd-tls-card__summary">
        Every hop that carries a token is TLS-encrypted. The BFF is the sole token
        custodian — no token is ever sent over plaintext or exposed to the browser.
      </p>
      {expanded && (
        <div className="tcd-tls-card__hops">
          {TLS_HOPS.map((hop) => (
            <div
              key={hop.host}
              className={`tcd-tls-hop${hop.internal ? " tcd-tls-hop--internal" : ""}`}
            >
              <div className="tcd-tls-hop__route">
                <span className="tcd-tls-hop__from">{hop.from}</span>
                <span className="tcd-tls-hop__arrow">→</span>
                <span className="tcd-tls-hop__to">{hop.to}</span>
                <code className="tcd-tls-hop__host">{hop.host}</code>
                <span className={`tcd-tls-hop__proto tcd-tls-hop__proto--${hop.protocol.toLowerCase()}`}>
                  {hop.protocol}
                </span>
              </div>
              <div className="tcd-tls-hop__cert">{hop.cert}</div>
              <div className="tcd-tls-hop__note">{hop.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Phase 266 R3: spec-citation pills ───────────────────────────────────────

/**
 * Renders clickable spec-reference pill(s) for a token chain event's specRef field.
 * Multi-spec citations like "RFC 8693 + draft-ietf-oauth-identity-chaining" split on " + ".
 * Hover/click expands a 1-3 sentence educational summary sourced from specGuide.js (offline).
 * Per REGRESSION_PLAN §0: no emoji in pill labels.
 */
function SpecRefPill({ specRef }) {
  const [expanded, setExpanded] = React.useState(false);
  const refs = specRef.split(" + ");
  return (
    <span className="tcd-specref-group">
      {refs.map((r) => {
        const entry = SPEC_GUIDE[r] || SPEC_GUIDE[specRef] || null;
        if (!entry) {
          return (
            <span key={r} className="tcd-specref-pill tcd-specref-unknown">
              {r}
            </span>
          );
        }
        return (
          <a
            key={r}
            className="tcd-specref-pill"
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setExpanded(true)}
            onMouseLeave={() => setExpanded(false)}
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            title={entry.title}
          >
            {r}
            <span className="tcd-specref-link-icon" aria-hidden="true">
              {"↗"}
            </span>
          </a>
        );
      })}
      {expanded && (
        <div className="tcd-specref-explainer">
          {refs.map((r) => {
            const entry = SPEC_GUIDE[r] || SPEC_GUIDE[specRef] || null;
            return entry ? (
              <div key={r} className="tcd-specref-explainer-row">
                <strong>{entry.title}:</strong> {entry.summary}{" "}
                <a href={entry.url} target="_blank" rel="noopener noreferrer">
                  read spec {"↗"}
                </a>
              </div>
            ) : null;
          })}
        </div>
      )}
    </span>
  );
}

/** Renders one step in the token chain. The inspect icon (right side) opens the floating inspector panel. */
// Compute what THIS token differs from the previous step's token — so each
// card can show, at a glance, what the exchange actually changed (the user
// asked for this: "highlight the changes so the user can easily see what
// happened in each card"). Compares audience, scope set, and the delegation
// (act) chain between consecutive events that carry claims.
function diffFromPrev(event, prevEvent) {
  const cur = event?.claims;
  const prev = prevEvent?.claims;
  if (!cur || !prev) return [];
  const changes = [];

  const audStr = (a) => (Array.isArray(a) ? a.join(" ") : a || "");
  if (audStr(cur.aud) !== audStr(prev.aud) && (cur.aud || prev.aud)) {
    changes.push({
      kind: "aud",
      label: "Audience narrowed",
      from: audStr(prev.aud) || "(none)",
      to: audStr(cur.aud) || "(none)",
    });
  }

  const toScopeSet = (s) =>
    new Set(
      (typeof s === "string"
        ? s.split(/\s+/)
        : Array.isArray(s)
          ? s
          : []
      ).filter(Boolean),
    );
  const curScopes = toScopeSet(cur.scope);
  const prevScopes = toScopeSet(prev.scope);
  const removed = [...prevScopes].filter((s) => !curScopes.has(s));
  const added = [...curScopes].filter((s) => !prevScopes.has(s));
  if (removed.length || added.length) {
    changes.push({
      kind: "scope",
      label:
        removed.length && !added.length
          ? "Scopes narrowed"
          : added.length && !removed.length
            ? "Scopes added"
            : "Scopes changed",
      removed,
      added,
    });
  }

  const actSub = (c) =>
    c?.act?.sub || (typeof c?.act === "string" ? c.act : null);
  if (actSub(cur) !== actSub(prev)) {
    changes.push({
      kind: "act",
      label: actSub(prev)
        ? "Delegation actor changed"
        : "Delegation (act) added",
      from: actSub(prev) || "(none)",
      to: actSub(cur) || "(none)",
    });
  }

  return changes;
}

function EventRow({
  event,
  prevEvent,
  isLast,
  nextEvent,
  idTokenMode,
  onInspect,
  hints,
  validationMode,
}) {
  const changeDiff = diffFromPrev(event, prevEvent);
  const inspectBtnRef = useRef(null);
  const hasDetail =
    event.claims ||
    event.explanation ||
    event.exchangeRequest ||
    event.jwtFullDecode ||
    event.mayActPresent !== undefined ||
    event.actPresent !== undefined;

  const handleOpen = () => {
    if (!hasDetail) return;
    onInspect(event, inspectBtnRef.current);
  };

  // Extract user ID and agent ID for prominent display
  const userId = event.claims?.sub;
  const agentId =
    event.claims?.act?.sub ||
    (typeof event.claims?.act === "string" ? event.claims.act : null);

  // Compact hints shown on the row — click inspect for full educational detail
  const triggerHint =
    event.trigger === "high_risk"
      ? { text: "⚡ High-Risk Transaction", cls: "warn" }
      : null;
  const mayActHint =
    event.mayActPresent === true
      ? event.mayActValid
        ? { text: "✅ may_act valid", cls: "ok" }
        : { text: "❌ may_act mismatch", cls: "error" }
      : event.mayActPresent === false
        ? { text: "⚠️ may_act absent", cls: "warn" }
        : null;
  const actHint =
    event.actPresent === true
      ? { text: "✅ act claimed", cls: "ok" }
      : event.actPresent === false && event.actExpectedHere !== false
        ? { text: "⚠️ no act claim", cls: "warn" }
        : event.actPresent === false && event.actExpectedHere === false
          ? { text: "ℹ️ act added after Exchange #2", cls: "info" }
          : null;
  // scope injection hint — shows when scopes were BFF-injected (demo mode)
  const scopeInjectedHint =
    event.scopeInjected === true
      ? { text: "⚡ Scopes INJECTED (demo)", cls: "warn" }
      : null;
  // introspection hint — shows when BFF validates tokens via PingOne introspection (not just local JWT decode)
  const introspectionHint =
    validationMode === "introspection" &&
    (event.tokenType === "user_token" ||
      event.eventType === "auth" ||
      event.id === "user-token" ||
      (event.id && event.id.startsWith("synthetic-session")))
      ? { text: "\u{1F52C} PingOne verified", cls: "ok" }
      : null;
  // aud hint — only on tokens where we have explicit validation data
  const audHintRaw = event.claims?.aud;
  const audShort = audHintRaw
    ? (Array.isArray(audHintRaw)
        ? audHintRaw[audHintRaw.length - 1]
        : String(audHintRaw)
      )
        .split("/")
        .pop()
    : null;
  const audHint =
    (event.id === "exchanged-token" ||
      event.id === "exchanged-token-fallback") &&
    event.audExpected !== undefined
      ? event.audMatches
        ? { text: `✅ aud: ${audShort || event.audExpected}`, cls: "ok" }
        : { text: `❌ aud mismatch`, cls: "error" }
      : event.id === "user-token" && audHintRaw
        ? { text: `aud: ${audShort || audHintRaw}`, cls: "info" }
        : null;
  const constraintHint =
    (event.id === "exchanged-token" ||
      event.id === "exchanged-token-fallback") &&
    event.status !== "waiting"
      ? { text: "Constraint-enforced", cls: "ok" }
      : null;
  const authorizeDecisionHint =
    (event.id === "authorize-decision" || event.id === "gw-authorize") &&
    (event.authorizeDecision || event.decision)
      ? (() => {
          const d = event.authorizeDecision || event.decision;
          const eng =
            event.authorizeEngine ||
            (event.id === "gw-authorize" ? "pingone" : "simulated");
          if (d === "PERMIT") return { text: `PERMIT — ${eng}`, cls: "ok" };
          if (d === "DENY") return { text: `DENY — ${eng}`, cls: "error" };
          return { text: `${d} — ${eng}`, cls: "warn" };
        })()
      : null;

  // Phase 266 — credentialPath visual identity per chain segment
  const credPath = event.credentialPath || "oauth_bearer";
  const credPathBadgeText =
    credPath === "api_key"
      ? "API-KEY PATH"
      : credPath === "dual_token"
        ? "ACCESS + ID-TOKEN PATH"
        : "OAUTH BEARER PATH";

  return (
    <div
      className={`tcd-event-wrap tcd-path-${credPath}`}
      data-credential-path={credPath}
    >
      {/* Phase 266 path badge — plain text, no emoji (REGRESSION_PLAN §0) */}
      <span className="tcd-path-badge">{credPathBadgeText}</span>
      {/* Left-border color must reflect the resolved status bucket, not the raw
          status string — otherwise a server status without a matching CSS rule
          (error/failure/denied/expired/timeout/degraded) renders with no
          failure styling, indistinguishable from success. */}
      <div className={`tcd-event ${resolveStatusVisual(event.status).bucket}`}>
        <div className="tcd-event-content">
          <div className="tcd-event-title-row">
            <TokenColorDot
              type={deriveTokenCategory(event.label, event.id, event.tokenType)}
              size={10}
            />
            <span className="tcd-event-label">{event.label}</span>
            {/* Phase 266 R3 — spec-citation pill */}
            {event.specRef && <SpecRefPill specRef={event.specRef} />}
          </div>

          {/* Prominent User ID and Agent ID display with enhanced visual treatment */}
          {(userId || agentId) && (
            <div className="tcd-event-ids-row">
              {userId && (
                <button
                  className="tcd-event-id tcd-event-id--user"
                  title={`User ID (sub claim): ${userId}`}
                  onClick={() => navigator.clipboard?.writeText(userId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigator.clipboard?.writeText(userId);
                    }
                  }}
                  type="button"
                >
                  {getStepSubLabel(event.id)}: {fmtSub(userId, hints)}
                </button>
              )}
              {agentId && (
                <button
                  className="tcd-event-id tcd-event-id--agent"
                  title={`Agent ID (act claim): ${agentId}`}
                  onClick={() => navigator.clipboard?.writeText(agentId)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigator.clipboard?.writeText(agentId);
                    }
                  }}
                  type="button"
                >
                  Agent:{" "}
                  {agentId.length > 16 ? agentId.slice(0, 14) + "…" : agentId}
                </button>
              )}
              {/* Show nested MCP server ID for 2-exchange tokens */}
              {event.claims?.act?.act?.sub && (
                <button
                  className="tcd-event-id tcd-event-id--mcp"
                  title={`MCP Server ID (act.act.sub claim): ${event.claims.act.act.sub}`}
                  onClick={() =>
                    navigator.clipboard?.writeText(event.claims.act.act.sub)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigator.clipboard?.writeText(event.claims.act.act.sub);
                    }
                  }}
                  type="button"
                >
                  MCP:{" "}
                  {event.claims.act.act.sub.length > 16
                    ? event.claims.act.act.sub.slice(0, 14) + "…"
                    : event.claims.act.act.sub}
                </button>
              )}
            </div>
          )}

          <div
            className={`tcd-event-meta-row${event.rfc ? "" : " tcd-event-meta-row--no-rfc"}`}
          >
            {event.rfc ? (
              <RfcRef rfc={event.rfc} className="tcd-event-rfc" />
            ) : null}
            {event.tokenType && (
              <span
                className={`tcd-token-type tcd-token-type--${event.tokenType}`}
              >
                {event.tokenType.replace("_", " ").toUpperCase()}
              </span>
            )}
            <StatusBadge status={event.status} />
          </div>
          {changeDiff.length > 0 && (
            <div className="tcd-event-diff" aria-label="What this step changed">
              <span className="tcd-event-diff-title">What changed</span>
              {changeDiff.map((c, ci) => (
                <div
                  key={ci}
                  className={`tcd-event-diff-row tcd-event-diff-row--${c.kind}`}
                >
                  <span className="tcd-event-diff-label">{c.label}</span>
                  {c.kind === "scope" ? (
                    <span className="tcd-event-diff-detail">
                      {c.removed.length > 0 && (
                        <span className="tcd-diff-removed">
                          − {c.removed.join(", ")}
                        </span>
                      )}
                      {c.added.length > 0 && (
                        <span className="tcd-diff-added">
                          + {c.added.join(", ")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="tcd-event-diff-detail">
                      <span className="tcd-diff-removed">{c.from}</span>
                      <span className="tcd-diff-arrow"> → </span>
                      <span className="tcd-diff-added">{c.to}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {(triggerHint ||
            mayActHint ||
            actHint ||
            audHint ||
            constraintHint ||
            introspectionHint ||
            authorizeDecisionHint) && (
            <div className="tcd-event-hints">
              {triggerHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${triggerHint.cls}`}
                >
                  {triggerHint.text}
                </span>
              )}
              {authorizeDecisionHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${authorizeDecisionHint.cls}`}
                >
                  {authorizeDecisionHint.text}
                </span>
              )}
              {audHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${audHint.cls}`}
                >
                  {audHint.text}
                </span>
              )}
              {constraintHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${constraintHint.cls}`}
                >
                  {constraintHint.text}
                </span>
              )}
              {mayActHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${mayActHint.cls}`}
                >
                  {mayActHint.text}
                </span>
              )}
              {actHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${actHint.cls}`}
                >
                  {actHint.text}
                </span>
              )}
              {scopeInjectedHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${scopeInjectedHint.cls}`}
                >
                  {scopeInjectedHint.text}
                </span>
              )}
              {introspectionHint && (
                <span
                  className={`tcd-event-hint tcd-event-hint--${introspectionHint.cls}`}
                >
                  {introspectionHint.text}
                </span>
              )}
            </div>
          )}
          <ClaimsStrip event={event} hints={hints} />
          {hasDetail && (
            <div className="tcd-inspect-row">
              <button
                ref={inspectBtnRef}
                type="button"
                className="tcd-inspect-btn"
                onClick={handleOpen}
                aria-label={`Inspect ${event.label}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    cx="6.5"
                    cy="6.5"
                    r="4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="9.7"
                    y1="9.7"
                    x2="14"
                    y2="14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M10 3h3v3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="10"
                    y1="6"
                    x2="13"
                    y2="3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                Token Details
              </button>
            </div>
          )}
        </div>
      </div>

      {!isLast && (
        <div className="tcd-connector">
          <div className="tcd-connector-line" />
          <span className="tcd-connector-arrow">↓</span>
          <ScopeDelta fromEvent={event} toEvent={nextEvent} />
          <div className="tcd-rfc-annotation">
            <a
              className="tcd-rfc-link"
              href="https://www.rfc-editor.org/rfc/rfc8693"
              target="_blank"
              rel="noopener noreferrer"
            >
              RFC 8693
            </a>
            {" · "}
            <span>
              {idTokenMode ? "ID Token 2-Token Exchange" : "2-Token Exchange"}
            </span>
            {nextEvent?.claims?.aud && (
              <span className="tcd-aud-label">
                {" → aud: "}
                {Array.isArray(nextEvent.claims.aud)
                  ? nextEvent.claims.aud[0]
                  : nextEvent.claims.aud}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── History entry — compact summary row (full detail is in "Current call") ────

function HistoryEntry({ entry }) {
  const [expanded, setExpanded] = React.useState(false);
  const ts = new Date(entry.timestamp).toLocaleTimeString();
  const total = entry.events.length;
  // Use the resolved visual bucket, not raw === "error"/"success". The chain
  // emits failed/failure/denied/expired/timeout (all "failed" bucket) and
  // active/success/exchanged (success-ish) — keying off two literal strings
  // classified a run full of `failed` steps as "partial" (grey ~), hiding
  // past failures in History.
  const isFailBucket = (s) => resolveStatusVisual(s).bucket === "failed";
  const isOkBucket = (s) => {
    const b = resolveStatusVisual(s).bucket;
    return b === "active" || b === "exchanged";
  };
  const errors = entry.events.filter((e) => isFailBucket(e.status)).length;
  const successes = entry.events.filter((e) => isOkBucket(e.status)).length;
  const statusClass =
    errors > 0
      ? "error"
      : successes === total && total > 0
        ? "success"
        : "partial";
  const statusIcon =
    errors > 0 ? "✗" : successes === total && total > 0 ? "✓" : "~";
  return (
    <div
      className="tcd-hist-entry"
      style={{ cursor: "pointer" }}
      onClick={() => setExpanded((e) => !e)}
    >
      <div
        className="tcd-hist-head tcd-hist-head--static"
        style={{ userSelect: "none" }}
      >
        <span style={{ marginRight: 6, fontSize: "0.75rem", color: "#374151" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span className="tcd-hist-tool">{entry.tool}</span>
        <span className="tcd-hist-meta">
          <span className={`tcd-hist-status tcd-hist-status--${statusClass}`}>
            {statusIcon}
          </span>
          <span className="tcd-hist-steps">
            {total} step{total !== 1 ? "s" : ""}
          </span>
        </span>
        <span className="tcd-hist-ts">{ts}</span>
      </div>
      {expanded && (
        <div
          style={{
            padding: "6px 12px 10px 28px",
            background: "#f8fafc",
            borderTop: "1px solid #e2e8f0",
          }}
        >
          {entry.events.length === 0 ? (
            <span style={{ fontSize: "0.78rem", color: "#374151" }}>
              No step detail available.
            </span>
          ) : (
            entry.events.map((ev, i) => {
              const evBucket = resolveStatusVisual(ev.status).bucket;
              const evStatus =
                evBucket === "failed"
                  ? "✗"
                  : evBucket === "active" || evBucket === "exchanged"
                    ? "✓"
                    : "~";
              const evColor =
                evBucket === "failed"
                  ? "#dc2626"
                  : evBucket === "active" || evBucket === "exchanged"
                    ? "#16a34a"
                    : "#64748b";
              const scopeSummary = ev.claims?.scope
                ? (typeof ev.claims.scope === "string"
                    ? ev.claims.scope.split(" ")
                    : []
                  )
                    .slice(0, 3)
                    .join(", ") +
                  (ev.claims.scope.split(" ").length > 3 ? "…" : "")
                : null;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "4px 0",
                    borderBottom:
                      i < entry.events.length - 1
                        ? "1px dashed #e2e8f0"
                        : "none",
                  }}
                >
                  <span
                    style={{
                      color: evColor,
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      flexShrink: 0,
                      marginTop: 1,
                    }}
                  >
                    {evStatus}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "#1e293b",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {ev.label || ev.id}
                    </div>
                    {scopeSummary && (
                      <div
                        style={{
                          fontSize: "0.72rem",
                          color: "#2563eb",
                          marginTop: 1,
                        }}
                      >
                        🔑 {scopeSummary}
                      </div>
                    )}
                    {ev.rfc && (
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "#374151",
                          marginTop: 1,
                        }}
                      >
                        {ev.rfc}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PLACEHOLDER_EVENTS = [
  {
    id: "user-token",
    label: "Subject Token — user access token (RFC 8693 §2.1)",
    status: "waiting",
    claims: null,
    explanation:
      "Issued by PingOne after Authorization Code + PKCE login. Stored securely in the Backend-for-Frontend (BFF) session (server-side, httpOnly cookie — never exposed to the browser). Contains may_act authorising the Backend-for-Frontend (BFF) to exchange it on the user's behalf.",
    rfc: "RFC 7519 · RFC 9068",
  },
  {
    id: "exchange",
    label:
      "Token Exchange (RFC 8693 §3.1): subject_token → MCP-scoped access token",
    status: "waiting",
    claims: null,
    explanation:
      "Backend-for-Frontend (BFF) presents the user access token to PingOne as subject_token. PingOne validates may_act, narrows the scope to the tool's required scopes, and issues the MCP access token with an act claim identifying the Backend-for-Frontend (BFF) as the actor. The user access token NEVER leaves the Backend-for-Frontend (BFF).",
    rfc: "RFC 8693 · RFC 8707",
  },
  {
    id: "exchanged-token",
    label: "MCP-Scoped Access Token (RFC 8693 §3.2) → MCP server",
    status: "waiting",
    claims: null,
    explanation:
      "The MCP access token is scoped to the MCP server audience with narrowed scopes. Contains act: { client_id: bff } — proves delegation chain. The user access token stays in the Backend-for-Frontend (BFF); only the MCP access token reaches the MCP server and Banking API.",
    rfc: "RFC 8693",
  },
];

/** Computes the initial panel position to the right of the trigger element. */
function calcInitialPos(triggerEl) {
  if (triggerEl) {
    const rect = triggerEl.getBoundingClientRect();
    const x = Math.min(rect.right + 16, window.innerWidth - 820);
    const y = Math.max(60, rect.top - 40);
    return { x, y };
  }
  return { x: Math.max(60, window.innerWidth - 900), y: 100 };
}

// ---------- Exchange mode banner -----------------------------------------

const EXCHANGE_MODE_MAP = {
  "2-exchange": {
    label: "2-Token Exchange",
    cls: "tcd-exc-banner--teal",
    desc: "Nested act: subject → agent → MCP (RFC 8693)",
  },
  "with-actor": {
    label: "1-Exchange + actor token",
    cls: "tcd-exc-banner--blue",
    desc: "act claim present — BFF delegated per RFC 8693",
  },
  "subject-only": {
    label: "1-Exchange (no actor)",
    cls: "tcd-exc-banner--slate",
    desc: "No act claim — subject-only RFC 8693",
  },
};

function ExchangeModeBanner({ events }) {
  if (!events || events.length === 0) return null;
  const ev = events.find((e) => e.id === "exchanged-token" && e.exchangeMethod);
  if (!ev) return null;
  const info = EXCHANGE_MODE_MAP[ev.exchangeMethod];
  if (!info) return null;
  return (
    <div className={"tcd-exc-banner " + info.cls}>
      <span className="tcd-exc-badge">{info.label}</span>
      <span className="tcd-exc-desc">{info.desc}</span>
    </div>
  );
}

const TokenChainDisplay = ({ idTokenMode = false, hideHeader = false }) => {
  const ctx = useTokenChainOptional();
  const edu = useEducationUIOptional();
  const [tab, setTab] = useState("current");
  const [sessionPreviewEvents, setSessionPreviewEvents] = useState(null);
  const [sessionPreviewFetched, setSessionPreviewFetched] = useState(false);
  const [agentCcEvents, setAgentCcEvents] = useState(null);
  const [inspectedEvent, setInspectedEvent] = useState(null);
  const [inspectorPos, setInspectorPos] = useState({ x: 120, y: 100 });
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null); // 'updated' | 'completed' | null
  // Identity hints sourced from TokenChainContext (fetched once, shared across surfaces)
  const identityHints = ctx?.resolvedIdentity ?? null;

  // Per-instance request deduplication (avoids cross-instance interference when
  // multiple TokenChainDisplay instances share the same window event listeners).
  const sessionPreviewPromiseRef = useRef(null);
  const lastFetchTimeRef = useRef(0);

  /** Fetch session preview (called on mount, on login, and when live events reset). */
  const fetchSessionPreview = useCallback(async () => {
    const now = Date.now();
    // Skip if another fetch is in flight (per-instance, not shared across instances)
    if (sessionPreviewPromiseRef.current) {
      return sessionPreviewPromiseRef.current;
    }
    // Skip if we just fetched recently (cooldown)
    if (now - lastFetchTimeRef.current < FETCH_COOLDOWN_MS) {
      return;
    }

    lastFetchTimeRef.current = now;
    sessionPreviewPromiseRef.current = (async () => {
      try {
        const res = await fetch("/api/tokens/session-preview", {
          credentials: "include",
          _silent: true,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.tokenEvents) && data.tokenEvents.length > 0) {
          setSessionPreviewEvents(data.tokenEvents);
        }
      } catch (_err) {
        /* non-fatal — keep placeholder */
      } finally {
        sessionPreviewPromiseRef.current = null;
        setSessionPreviewFetched(true);
      }
    })();
    return sessionPreviewPromiseRef.current;
  }, []);

  /**
   * Fetch on mount — App.js dispatches 'userAuthenticated' and sets loading=false
   * BEFORE this component renders, so the event always fires before mount.
   * fetchSessionPreview handles 401/non-OK gracefully (returns early, keeps placeholder).
   */
  React.useEffect(() => {
    void fetchSessionPreview();
  }, [fetchSessionPreview]);

  /** Re-fetch session preview after a successful PingOne login (e.g. session expiry re-auth). */
  React.useEffect(() => {
    const onAuth = () => {
      setSessionPreviewEvents(null); // clear stale preview so new fetch replaces it
      void fetchSessionPreview();
    };
    window.addEventListener("userAuthenticated", onAuth);
    return () => window.removeEventListener("userAuthenticated", onAuth);
  }, [fetchSessionPreview]);

  /** Refresh token chain after every agent request (chip/button or NL path). */
  React.useEffect(() => {
    const onAgentResult = () => {
      // Reset cooldown so this forced refresh is never skipped.
      lastFetchTimeRef.current = 0;
      void fetchSessionPreview();
    };
    window.addEventListener("banking-agent-result", onAgentResult);
    return () =>
      window.removeEventListener("banking-agent-result", onAgentResult);
  }, [fetchSessionPreview]);

  /** Silently prefetch agent CC token on mount — shows agent actor identity before first MCP call. */
  React.useEffect(() => {
    // Skip on documentation-only pages — they don't need agent-context tokens
    // and the BFF returns 401 there, producing noisy DevTools warnings.
    if (isEducationalPath()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/tokens/agent-cc-preview", {
          credentials: "include",
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (Array.isArray(data.tokenEvents) && data.tokenEvents.length > 0) {
          setAgentCcEvents(data.tokenEvents);
        }
      } catch (_err) {
        /* non-fatal — best-effort prefetch */
        console.warn(
          "[TokenChainDisplay] agent-cc-preview fetch failed:",
          _err.message,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isLive = ctx && ctx.events.length > 0;
  const isSessionPreview =
    !isLive &&
    Array.isArray(sessionPreviewEvents) &&
    sessionPreviewEvents.length > 0;
  const effectivePlaceholders = React.useMemo(() => {
    if (!idTokenMode) return PLACEHOLDER_EVENTS;
    return PLACEHOLDER_EVENTS.map((ev) => {
      if (ev.id === "user-token")
        return {
          ...ev,
          label: "Subject Token — user ID token (RFC 8693 §2.1)",
        };
      if (ev.id === "exchange")
        return {
          ...ev,
          label:
            "Token Exchange (RFC 8693 §3.1): subject ID token u2192 MCP-scoped access token",
        };
      return ev;
    });
  }, [idTokenMode]);
  const currentEvents = isLive
    ? ctx.events
    : isSessionPreview
      ? sessionPreviewEvents
      : effectivePlaceholders;
  // Prepend agent CC token event if present and not already represented in the chain.
  // Dedup: filter agentCcEvents to only include events whose IDs don't exist in currentEvents.
  const currentEventsWithCc = React.useMemo(() => {
    if (!Array.isArray(agentCcEvents) || agentCcEvents.length === 0)
      return currentEvents;
    // Build a Set of all IDs already present in currentEvents for O(1) dedup
    const currentEventIds = new Set(
      currentEvents.map((e) => e.id).filter(Boolean),
    );
    // Filter agentCcEvents: only keep events whose IDs are not already in currentEvents
    const uniqueAgentCcEvents = agentCcEvents.filter(
      (e) => !currentEventIds.has(e.id),
    );
    if (uniqueAgentCcEvents.length === 0) return currentEvents;
    // Prepend unique agent CC events to currentEvents
    return [...uniqueAgentCcEvents, ...currentEvents];
  }, [currentEvents, agentCcEvents]);
  const isPlaceholder = !isLive && !isSessionPreview;
  const history = ctx ? ctx.history : [];

  /** Open the inspector for a given event, positioning near the trigger element. */
  const handleInspect = useCallback((event, triggerEl) => {
    setInspectorPos(calcInitialPos(triggerEl));
    setInspectedEvent(event);
  }, []);

  /** Copy the full token chain (current events + history) to the clipboard as pretty JSON. */
  const handleCopyAll = useCallback(() => {
    const payload = {
      copied_at: new Date().toISOString(),
      source: isLive
        ? "live"
        : isSessionPreview
          ? "session-preview"
          : "placeholder",
      current_events: currentEventsWithCc.map((ev) => ({
        id: ev.id,
        label: ev.label,
        status: ev.status,
        alg: ev.alg,
        claims: ev.claims,
        jwtFullDecode: ev.jwtFullDecode,
        mayActPresent: ev.mayActPresent,
        mayActValid: ev.mayActValid,
        mayActDetails: ev.mayActDetails,
        actPresent: ev.actPresent,
        actDetails: ev.actDetails,
        audExpected: ev.audExpected,
        audActual: ev.audActual,
        audMatches: ev.audMatches,
        exchangeRequest: ev.exchangeRequest,
        explanation: ev.explanation,
      })),
      history: (ctx?.history || []).map((h) => ({
        tool: h.tool,
        timestamp: h.timestamp,
        events: h.events.map((ev) => ({
          id: ev.id,
          label: ev.label,
          status: ev.status,
          claims: ev.claims,
          mayActPresent: ev.mayActPresent,
          mayActValid: ev.mayActValid,
          actPresent: ev.actPresent,
        })),
      })),
    };
    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // fallback for older browsers / non-HTTPS
        const ta = document.createElement("textarea");
        ta.value = JSON.stringify(payload, null, 2);
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
  }, [currentEventsWithCc, ctx, isLive, isSessionPreview]);

  // Track when live events arrive; show 'Updated' badge for 30s then 'Completed'.
  useEffect(() => {
    if (!isLive || currentEventsWithCc.length === 0) return;
    setLastUpdated(new Date());
    setUpdateStatus("updated");
    const t = setTimeout(() => setUpdateStatus("completed"), 30000);
    return () => clearTimeout(t);
  }, [currentEventsWithCc, isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="tcd-root">
        {!hideHeader && (
          <div className="tcd-header">
            <div className="tcd-header-title-row">
              <div className="tcd-header-title">
                Token Chain
                {isLive && (
                  <span
                    className="tcd-live-dot"
                    title="Live data from last tool call"
                  />
                )}
                {isSessionPreview && (
                  <span
                    className="tcd-session-dot"
                    title={
                      idTokenMode
                        ? "User ID token loaded from your Backend-for-Frontend (BFF) session. Use the AI Agent to run RFC 8693 exchange and see MCP access token claims."
                        : "User access token loaded from your Backend-for-Frontend (BFF) session. Use the AI Agent to run RFC 8693 exchange and see MCP access token claims."
                    }
                  />
                )}
              </div>
              {isLive && ctx?.clearEvents && (
                <button
                  type="button"
                  className="tcd-clear-btn"
                  onClick={() => ctx.clearEvents()}
                  title="Clear live token events and return to session preview"
                  aria-label="Clear token chain"
                >
                  Clear
                </button>
              )}
              {edu && (
                <button
                  type="button"
                  className="tcd-copy-btn"
                  onClick={() => edu.open("ietf-standards", "overview")}
                  title="Open IETF Agentic Identity Standards reference"
                  aria-label="View all RFC standards"
                >
                  Standards
                </button>
              )}
              <button
                type="button"
                className={`tcd-copy-btn${copied ? " tcd-copy-btn--ok" : ""}`}
                onClick={handleCopyAll}
                title="Copy full token chain as JSON (for debugging)"
                aria-label="Copy token chain to clipboard"
              >
                {copied ? "✅ Copied" : "📋 Copy"}
              </button>
            </div>
            {updateStatus && lastUpdated && (
              <div className="tcd-status-row">
                <span
                  className={`tcd-status-badge tcd-status-badge--${updateStatus}`}
                >
                  {updateStatus === "updated" ? "Updated" : "Completed"}
                </span>
                <span className="tcd-last-updated">
                  {lastUpdated.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" · "}
                  {lastUpdated.toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
            <p className="tcd-header-sub">
              {idTokenMode
                ? "ID Token 2-Token Exchange Flow — ID token → RFC 8693 exchange → MCP access token → MCP server → Banking API"
                : "2-Token Exchange Flow — User access token stays in BFF → RFC 8693 exchange → MCP access token → MCP server → Banking API"}
            </p>
          </div>
        )}

        <div className="tcd-tabs">
          <button
            type="button"
            className={`tcd-tab ${tab === "current" ? "active" : ""}`}
            onClick={() => setTab("current")}
          >
            Current call
          </button>
          <button
            type="button"
            className={`tcd-tab ${tab === "mcp-results" ? "active" : ""}`}
            onClick={() => setTab("mcp-results")}
          >
            MCP Results{" "}
            {(ctx?.mcpToolCalls?.length || 0) > 0 && (
              <span className="tcd-hist-count">{ctx.mcpToolCalls.length}</span>
            )}
          </button>
          <button
            type="button"
            className={`tcd-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            History{" "}
            {history.length > 0 && (
              <span className="tcd-hist-count">{history.length}</span>
            )}
          </button>
        </div>

        {tab === "current" && (
          <>
            <TokenColorLegend />
            <div className="tcd-events">
              {!isLive && (
                <div className="tcd-placeholder-note">
                  {isSessionPreview
                    ? "You are signed in — the user access token row is decoded from your Backend-for-Frontend (BFF) session (no raw JWT in the browser). Use the AI Agent (e.g. list accounts) to run the flow and see RFC 8693 exchange + MCP access token rows update live."
                    : "Sign in and load the dashboard to see your user access token, or make a banking / AI Agent request to see the full chain after exchange."}
                </div>
              )}
              {isLive && <ExchangeModeBanner events={currentEventsWithCc} />}
              {isPlaceholder &&
                identityHints?.currentUser &&
                !sessionPreviewFetched && (
                  <div className="tcd-empty-state">
                    <span className="tcd-empty-state__icon">🔗</span>
                    <p className="tcd-empty-state__msg">Token chain loading…</p>
                    <p className="tcd-empty-state__hint">
                      Interact with the AI Agent or make a banking action to see
                      the full OAuth 2.0 token chain.
                    </p>
                  </div>
                )}
              {isLive && ctx?.nlRoutingEvent && (
                <NlRoutingCard event={ctx.nlRoutingEvent} />
              )}
              <TlsSecurityCard />
              {(!isPlaceholder ||
                !identityHints?.currentUser ||
                sessionPreviewFetched) &&
                currentEventsWithCc.map((ev, i) => (
                  <EventRow
                    // Include index — event ids are NOT guaranteed unique
                    // (2-exchange paths can emit repeated ids); keying on id
                    // alone would collapse/drop a real step via React reconcile.
                    key={`${ev.id}-${i}`}
                    event={ev}
                    prevEvent={currentEventsWithCc[i - 1]}
                    isLast={i === currentEventsWithCc.length - 1}
                    nextEvent={currentEventsWithCc[i + 1]}
                    idTokenMode={idTokenMode}
                    onInspect={handleInspect}
                    hints={identityHints}
                    validationMode={ctx?.validationMode}
                  />
                ))}
            </div>
          </>
        )}

        {tab === "mcp-results" && (
          <div className="tcd-mcp-results">
            {!ctx?.mcpToolCalls || ctx.mcpToolCalls.length === 0 ? (
              <div className="tcd-placeholder-note">
                No MCP tool calls yet. Run a banking action through the AI Agent
                to see tool results.
              </div>
            ) : (
              ctx.mcpToolCalls.map((toolCall, i) => (
                <div
                  key={`${toolCall.timestamp}-${toolCall.toolName}-${i}`}
                  className="tcd-mcp-result-card"
                >
                  <div className="tcd-mcp-result-header">
                    <span className="tcd-mcp-result-tool">
                      {toolCall.toolName}
                    </span>
                    <span
                      className={`tcd-mcp-result-status tcd-mcp-result-status--${toolCall.status}`}
                    >
                      {toolCall.status === "success" ? "✓" : "✗"}{" "}
                      {toolCall.status}
                    </span>
                    {toolCall.duration > 0 && (
                      <span className="tcd-mcp-result-duration">
                        {toolCall.duration}ms
                      </span>
                    )}
                  </div>
                  {toolCall.resultSummary && (
                    <div className="tcd-mcp-result-summary">
                      {toolCall.resultSummary}
                    </div>
                  )}
                  {toolCall.resultJson && (
                    <details className="tcd-mcp-result-details">
                      <summary className="tcd-mcp-result-summary-toggle">
                        View JSON Response
                      </summary>
                      <pre className="tcd-mcp-result-json">
                        {JSON.stringify(toolCall.resultJson, null, 2)}
                      </pre>
                    </details>
                  )}
                  {toolCall.isDelegated && (
                    <div className="tcd-mcp-result-note">
                      🔐 Delegated (RFC 8693)
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="tcd-history">
            {history.length === 0 ? (
              <div className="tcd-placeholder-note">No history yet</div>
            ) : (
              history.map((entry) => (
                <HistoryEntry
                  key={`${entry.timestamp}-${entry.tool}`}
                  entry={entry}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Inspector panel — portalled to document.body, draggable, resizable, collapsible */}
      {inspectedEvent && (
        <TokenInspectorPanel
          key={inspectedEvent.id}
          event={inspectedEvent}
          initialPos={inspectorPos}
          onClose={() => setInspectedEvent(null)}
        />
      )}
    </>
  );
};

export default TokenChainDisplay;
