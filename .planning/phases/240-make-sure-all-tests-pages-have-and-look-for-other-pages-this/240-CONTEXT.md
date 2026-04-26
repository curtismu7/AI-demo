# Phase 240: PingOne API trace parity across test pages - Context

**Gathered:** 2026-04-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Ensure all test pages display consistent, real PingOne call transparency:
- Actual PingOne API endpoint being called
- Actual request payload sent to PingOne
- Actual response payload returned by PingOne
- Link to relevant PingOne API documentation page

Also evaluate adjacent non-test pages and include only pages where this transparency pattern materially helps debugging/education.

In scope:
- Existing test pages and their supporting backend routes
- Shared UI component standardization for PingOne request/response/doc-link display
- Coverage audit to identify additional pages where this pattern should be applied

Out of scope:
- Replacing non-PingOne generic API log viewers
- Large redesign of test-page layouts
- Changing auth or token-exchange semantics beyond trace visibility payloads
</domain>

<decisions>
## Decisions

### D-01: Test pages must show real PingOne API endpoint information
Each covered test section must show the real PingOne endpoint/method (not only BFF proxy paths).

### D-02: Show actual PingOne request JSON and response JSON
Each covered test section must expose request and response payloads captured from the real PingOne call path.

### D-03: Add PingOne docs link for each surfaced call
Each surfaced call should include a docs link pointing to the corresponding PingOne API docs page.

### D-04: Expand beyond test pages only where it clearly improves learning/debugging
Audit adjacent pages and include additional pages only when the same PingOne-call transparency is relevant.

### Claude's Discretion
- Exact component API for doc links and endpoint labels
- Which non-test pages qualify under D-04 after audit
- Backend payload normalization shape for PingOne request/response metadata
</decisions>

<specifics>
## Specific Ideas

- Existing shared UI panel: `PingOneApiPanel` is already used by MFA/Authz/PingOne test pages and should be extended, not replaced.
- Existing backend payload fields: routes commonly return `pingoneRequest` and `pingoneResponse`; this should be normalized and completed where missing.
- Candidate additional pages for D-04 audit: `DelegatedAccessPage`, `OAuthDebugLogViewer`, and other explicit PingOne diagnostic surfaces.
</specifics>

<deferred>
## Deferred Ideas

- Full centralized observability platform replacing per-section trace panels
- Non-PingOne API docs linking for every BFF call in the application
</deferred>

---

*Phase: 240-make-sure-all-tests-pages-have-and-look-for-other-pages-this*
*Context gathered: 2026-04-26*