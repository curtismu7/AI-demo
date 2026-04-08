# Phase 108: Add server restart notification modal with UX polish — Context

**Gathered:** 2026-04-08
**Status:** Ready for planning

---

## Phase Boundary

When the server restarts or returns 504 errors (connection failures), the UI should inform the user with a modal notification instead of silently failing. This includes:
- Detecting 504 errors and connection timeouts in API calls
- Displaying a "Server is restarting" modal to the user
- Auto-retry logic with backoff
- UX polish: animations, dismiss behavior, optional manual retry button
- Integration with existing modal patterns

---

## Implementation Decisions

### Notification Trigger
- Monitor fetch/API calls for 504 status codes and connection errors
- Show modal on first 504 or after 2+ consecutive failures

### Modal Behavior
- Block user interaction (modal overlay with aria-modal="true")
- Display message: "Server is restarting. Please wait..."
- Auto-dismiss on successful reconnection
- Offer "Retry Now" button for manual reconnection

### Integration
- Centralized error handler in bankingAgentService or new restartNotificationService
- Reuse existing modal CSS patterns (modal-overlay, modal-content from App.js)
- Stack with other modals (HITL, consent) without conflicts
- Works in all agent modes (FAB, dock, middle)

### UX Polish
- Fade-in/out animations
- Spinner indicator showing connection attempt
- Progressive messaging (attempt count: "Attempt 1 of 3...")
- Toast fallback if modal doesn't show (graceful degradation)

---

## Specific Ideas

- Service: `bankingRestartNotificationService.js` — centralized 504 detection and modal control
- Component: `ServerRestartModal.js` — modal UI with animations
- Hook integration: Global error interceptor in fetch wrapper or axios instance
- Auto-retry: exponential backoff (1s, 2s, 4s) up to max attempts
- Success signal: First successful API call or health check passes

---

## Deferred Ideas

- SMS/email notification of server restart (out of scope — UI only)
- Server-sent events (SSE) for explicit restart broadcasts (use simple polling instead)
- Persist restart event to localStorage for audit (not needed)

---

*Phase: 108-add-server-restart-notification-modal-with-ux-polish*
*Context gathered: 2026-04-08*
