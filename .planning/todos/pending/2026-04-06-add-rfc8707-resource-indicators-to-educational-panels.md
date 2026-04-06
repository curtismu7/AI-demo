---
created: 2026-04-06T14:59:00.000Z
title: Add RFC 8707 resource indicators to educational panels
area: docs
files:
  - banking_api_ui/src/components/
  - banking_api_server/services/oauthService.js
  - docs/education/
---

## Problem

RFC 8707 defines resource indicators for OAuth 2.0, which allow clients to explicitly signal to authorization servers which protected resources they intend to access. This is important for security (audience restriction) and token customization. Currently, our educational content doesn't cover this important OAuth extension, and we need to verify if PingOne supports RFC 8707 resource indicators.

## Solution

Create educational panels explaining RFC 8707 resource indicators and investigate PingOne support. The educational content should cover:

1. **What are Resource Indicators**: OAuth 2.0 extension for explicit resource signaling
2. **Security Benefits**: Audience restriction, token customization, reduced blast radius
3. **Implementation**: How to use `resource` parameter in authorization and token requests
4. **PingOne Compatibility**: Verify if PingOne supports RFC 8707 and demonstrate usage
5. **Practical Examples**: Show resource indicators in our banking demo context

Key technical points to cover:
- `resource` parameter in authorization requests
- Audience restriction in access tokens (`aud` claim)
- Resource-specific token customization
- Integration with our token exchange flows
- Security improvements from explicit resource signaling

Investigate PingOne documentation and test RFC 8707 support in our current implementation.
