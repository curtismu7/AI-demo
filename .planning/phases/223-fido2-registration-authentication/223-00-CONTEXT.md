# Phase 223 CONTEXT

## Title
Fix FIDO registration and check authentication. Show the request and response for FIDO on the test page under each section for FIDO2

## Description
- Reference PingOne API docs for FIDO2 device registration and authentication:
  - https://developer.pingidentity.com/pingone-api/mfa/mfa-authentication/mfa-device-authentications/check-assertion-device-authentication.html
  - https://developer.pingidentity.com/pingone-api/mfa/users/mfa-devices/fido2-biometrics-devices/create-mfa-user-device-fido2---security_key.html
  - https://developer.pingidentity.com/pingone-api/mfa/introduction.html
- Compare backend and UI to PingOne docs and curl commands.
- Show the request and response for FIDO2 on the test page under each section for FIDO2.
- Be careful not to break other flows.

## Acceptance Criteria
- FIDO2 registration and authentication flows are fixed and match PingOne API/curl examples.
- Test page displays the actual request and response for FIDO2 registration and authentication.
- No regressions in other MFA or login flows.

## Notes
- See roadmap for phase 223.
- Created by GSD add-phase workflow.
