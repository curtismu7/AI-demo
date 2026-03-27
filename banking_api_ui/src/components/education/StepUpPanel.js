// banking_api_ui/src/components/education/StepUpPanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

export default function StepUpPanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'What is step-up',
      content: (
        <>
          <p>
            <strong>Step-up MFA</strong> requires a stronger authentication factor (or re-auth) before high-value or sensitive actions.
            In this demo, transfers and withdrawals at or above the configured threshold can trigger PingOne step-up (see Security Settings).
          </p>
          <p>
            To step up <strong>without</strong> sending the user through a full browser redirect, the stack can use <strong>CIBA</strong> when enabled:
            PingOne delivers approval <strong>out-of-band</strong> — by <strong>email</strong> or <strong>device push</strong> depending on your DaVinci setup
            (email-only avoids MFA push). See <strong>Learn → Login flow → CIBA (OOB)</strong> or the floating <strong>CIBA guide</strong>.
          </p>
          <p>
            For <strong>mandatory human approval</strong> before large money movement (separate from MFA), see{' '}
            <strong>Learn → Human-in-the-loop</strong> — it explains how the consent popup and the AI agent interact.
          </p>
        </>
      ),
    },
    {
      id: 'acr',
      label: 'ACR in PingOne',
      content: (
        <>
          <p>
            <strong>acr_values</strong> / policy names must match your PingOne <strong>Sign-On Policy</strong> (e.g. <code>Multi_factor</code>).
            Configure the required value in Security Settings so the Banking API requests the same policy PingOne enforces.
          </p>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="Step-up MFA"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
