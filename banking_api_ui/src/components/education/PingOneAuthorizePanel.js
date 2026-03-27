// banking_api_ui/src/components/education/PingOneAuthorizePanel.js
import React from 'react';
import EducationDrawer from '../shared/EducationDrawer';

export default function PingOneAuthorizePanel({ isOpen, onClose, initialTabId }) {
  const tabs = [
    {
      id: 'what',
      label: 'What it does',
      content: (
        <>
          <p>
            <strong>PingOne Authorize</strong> provides policy-based decisions (PDP) for transfers and withdrawals.
            When enabled, the Banking API asks PingOne whether the action is allowed under your configured policy.
            See Ping&apos;s{' '}
            <a href="https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html" target="_blank" rel="noopener noreferrer">
              Authorization using PingOne Authorize
            </a>
            {' '}overview and{' '}
            <a href="https://developer.pingidentity.com/pingone-api/authorize/authorization-decisions/decision-endpoints.html" target="_blank" rel="noopener noreferrer">
              Decision Endpoints
            </a>
            {' '}API reference.
          </p>
        </>
      ),
    },
    {
      id: 'policy',
      label: 'Policy configuration',
      content: (
        <>
          <p>
            Create policies and a <strong>decision endpoint</strong> in PingOne Authorize (see tutorials on the{' '}
            <a href="https://docs.pingidentity.com/pingone/authorization_using_pingone_authorize/p1az_overview.html" target="_blank" rel="noopener noreferrer">
              overview
            </a>
            ). Copy the policy or endpoint identifier expected by your integration into Security Settings.
            The Worker app credentials (client ID/secret) must be configured on the server for token exchange to Authorize.
            Implementation notes: <code>docs/PINGONE_AUTHORIZE_PLAN.md</code> in this repository.
          </p>
        </>
      ),
    },
  ];

  return (
    <EducationDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="PingOne Authorize"
      tabs={tabs}
      initialTabId={initialTabId}
    />
  );
}
