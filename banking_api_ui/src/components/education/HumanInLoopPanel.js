// banking_api_ui/src/components/education/HumanInLoopPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

export default function HumanInLoopPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'What is HITL?',
      content: (
        <>
          <p>
            <strong>Human-in-the-loop (HITL)</strong> means a <strong>real person</strong> must review and
            explicitly approve a sensitive action before the system completes it. The automation (including an
            AI agent) cannot silently execute that action on its own.
          </p>
          <p>
            This is different from <strong>man-in-the-middle (MITM)</strong>, which describes an attacker
            intercepting traffic. HITL is a <strong>safety and governance</strong> pattern: the human stays
            &quot;in the loop&quot; of approval for high-risk operations.
          </p>
          <p>
            Regulators and enterprise AI policies often expect HITL (or equivalent controls) for financial
            transactions, account changes, or anything that could cause material harm if the model or agent
            misbehaved.
          </p>
        </>
      ),
    },
    {
      id: 'patterns',
      label: 'Patterns & best practices',
      content: (
        <>
          <p>
            Modern assistants don&apos;t just answer questions—they can trigger tools, APIs, and workflows. That
            autonomy is useful, but it is not the same as human judgment. HITL exists so that{' '}
            <strong>sensitive or irreversible actions</strong> are not left entirely to automation.
          </p>

          <h3>Why human oversight matters</h3>
          <p>Even capable models can:</p>
          <ul>
            <li>
              <strong>Hallucinate actions</strong> — propose steps, IDs, or tools that don&apos;t exist or
              aren&apos;t appropriate.
            </li>
            <li>
              <strong>Misuse permissions</strong> — follow an ambiguous prompt into the wrong scope.
            </li>
            <li>
              <strong>Overreach</strong> — attempt something that should require explicit approval.
            </li>
            <li>
              <strong>Reduce traceability</strong> — if no one explicitly approved, audits and accountability
              suffer.
            </li>
          </ul>
          <p>
            HITL is not only about safety—it is about <strong>control</strong>: preventing mistakes before they
            happen, tying actions to a responsible person, and meeting governance expectations (for example in
            finance, operations, or regulated environments).
          </p>

          <h3>What &quot;delegating permission&quot; means</h3>
          <p>
            Delegation here does not mean &quot;more buttons.&quot; It means the agent is designed to{' '}
            <strong>ask and wait</strong>: it does <strong>not</strong> complete the risky action until a human
            explicitly approves. The usual loop is:
          </p>
          <ol>
            <li>The agent receives a task or user message.</li>
            <li>It proposes a concrete action (for example, a payment or access change).</li>
            <li>It <strong>pauses</strong> and surfaces that proposal to a person.</li>
            <li>The person reviews context and approves or rejects.</li>
            <li>Execution continues <strong>only</strong> if approval was given.</li>
          </ol>

          <h3>Common design patterns</h3>
          <p>
            <strong>Interrupt and resume</strong> — Pause mid-workflow, collect a yes/no or a choice, then
            continue. Fits tool approvals and checkpoints before final commits.
          </p>
          <p>
            <strong>Human-as-a-tool</strong> — The agent treats &quot;ask a human&quot; as a deliberate step when
            something is ambiguous or high stakes.
          </p>
          <p>
            <strong>Approval flows</strong> — Policies or roles determine who may approve (for example only
            certain staff or account owners). The agent may start a request; only authorized people complete it.
          </p>
          <p>
            <strong>Fallback escalation</strong> — If the agent fails, lacks access, or is uncertain, it routes
            the case to a person (dashboard, chat, email) instead of guessing.
          </p>
          <p>
            Real systems often combine these: checkpoints for irreversible steps, role-based approval for policy,
            and escalation when automation is not enough.
          </p>

          <h3>Practices that hold up in production</h3>
          <ul>
            <li>
              <strong>Design for decision points</strong> — Identify where human input is non-negotiable (money
              movement, access, destructive changes) and make those pauses explicit.
            </li>
            <li>
              <strong>Keep review requests clear</strong> — Summarize what will happen and why; avoid dumping raw
              opaque payloads on approvers when a short explanation will do.
            </li>
            <li>
              <strong>Prefer policy over one-off hacks</strong> — Centralize rules so they stay consistent and
              reviewable as the product evolves.
            </li>
            <li>
              <strong>Log approvals and denials</strong> — Audit trails support compliance and debugging, not
              just paperwork.
            </li>
            <li>
              <strong>Use async review when appropriate</strong> — Not every approval must be instant; some
              workflows can wait for a ticket, Slack, or a queue.
            </li>
          </ul>

          <p>
            The underlying idea is stable: <strong>agents should ask permission for actions you would not accept
            unattended.</strong> HITL is a durable pattern for building automation people can trust—not a temporary
            patch until models get &quot;smart enough&quot; to act alone on critical operations.
          </p>
        </>
      ),
    },
    {
      id: 'agent',
      label: 'This app and the agent',
      content: (
        <>
          <p>
            In this demo, <strong>transfers, withdrawals, and deposits over $500</strong> open a{' '}
            <strong>consent popup</strong> in the browser. The server first issues a <strong>consent challenge</strong>{' '}
            stored in your session; after you confirm, you post the transaction with a matching{' '}
            <code>consentChallengeId</code>. The AI banking assistant cannot complete that path without your
            browser session and the one-time challenge.
          </p>
          <p>
            The <strong>assistant</strong> (via MCP tools) still helps with balances, history, smaller transfers,
            and learning topics, but it cannot bypass the human approval step for those high-value writes: the
            server returns a consent error instead of executing the transfer. That models how a production stack
            keeps humans accountable for irreversible or high-impact money movement.
          </p>
          <p>
            <strong>Step-up MFA</strong> (see <em>Learn → Step-up MFA</em>) is complementary: it proves{' '}
            <em>who</em> is acting, while HITL here proves the <em>same person chose to authorize this specific
            payment</em>.
          </p>
        </>
      ),
    },
    {
      id: 'decline',
      label: 'Declining and lockout',
      content: (
        <>
          <p>
            If you <strong>cancel</strong> on the consent popup and confirm that you decline to authorize,
            the demo treats that as a <strong>policy decision</strong>: the transaction is denied, and the{' '}
            <strong>AI banking assistant is disabled</strong> for this browser session until you sign out and
            sign in again.
          </p>
          <p>
            That behavior is educational: it shows how organizations can tie <strong>agent access</strong> to{' '}
            <strong>user attestation</strong> — refusing required consent can trigger a controlled lockout of
            automated channels while leaving the normal dashboard (and sign-out) available.
          </p>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Human-in-the-loop (agent safety)"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
