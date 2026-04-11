# Phase 121: API Display Modal Enhancement

**Date:** 2026-04-11  
**Phase:** 121 — api-display-modal-enhancement  
**Depends on:** Phase 120 (UI/UX: Audit all buttons and navigation)

---

## User Vision

Integrate the new API display service (ApiCallDisplay) into dashboards and marketing page as a draggable, resizable modal for educational purposes. The modal should be able to be dragged off monitor and resized from all corners.

---

## Problem Statement

The current API display service exists as a component but is not easily accessible for educational purposes. Users need to see what the API looks like in context while interacting with the dashboard and marketing page. A modal approach would allow users to:
- View API calls in real-time while using the application
- Drag the modal off-monitor for side-by-side comparison
- Resize the modal from all corners for optimal viewing
- Access API display from multiple entry points (dashboard, marketing page)

---

## Solution Overview

1. **Modal Component Creation**
   - Create a reusable API Display Modal component
   - Implement drag functionality (can drag off-monitor)
   - Implement resize functionality (all corners)
   - Persist modal position and size in localStorage

2. **Dashboard Integration**
   - Add API Display Modal button to UserDashboard
   - Add API Display Modal button to Admin Dashboard
   - Ensure modal can be opened from multiple contexts

3. **Marketing Page Integration**
   - Add API Display Modal button to marketing page
   - Ensure modal works in marketing page context
   - Provide educational context for API display

4. **Educational Enhancement**
   - Add tooltips or help text explaining what the API display shows
   - Highlight key API calls relevant to current user action
   - Provide filtering options for API call categories

---

## Dependencies

- Phase 120: UI/UX audit completion
- Existing ApiCallDisplay.jsx component
- Existing API calls tracking infrastructure

---

## Deliverables

- API Display Modal component with drag/resize functionality
- Dashboard integration (UserDashboard, Admin Dashboard)
- Marketing page integration
- Educational tooltips and context
- Modal state persistence (position, size, open/closed)

---

## Estimated Duration

1-2 weeks

---

## Success Criteria

1. Modal can be opened from dashboard and marketing page
2. Modal is draggable and can be moved off-monitor
3. Modal is resizable from all corners
4. Modal position and size persist across page refreshes
5. API calls display in real-time
6. Educational context is clear for users
7. No performance degradation when modal is open

---

## Technical Approach

### Modal Component Structure
```javascript
// components/ApiDisplayModal.jsx
export default function ApiDisplayModal({ sessionId, onClose }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [size, setSize] = useState({ width: 600, height: 400 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  
  // Drag handlers
  // Resize handlers
  // Persistence to localStorage
}
```

### Integration Points
- UserDashboard: Add button in toolbar or sidebar
- Admin Dashboard: Add button in admin operations panel
- Marketing page: Add button in education section or floating action button

### Drag/Resize Implementation
- Use React hooks for drag state management
- Implement corner resize handles (8 points: 4 corners + 4 edges)
- Support off-screen dragging (no bounds restriction)
- Use CSS transform for smooth performance

---

## Files to Modify

### New Files
- `banking_api_ui/src/components/ApiDisplayModal.jsx`
- `banking_api_ui/src/components/ApiDisplayModal.css`

### Modified Files
- `banking_api_ui/src/components/UserDashboard.js` - Add modal trigger
- `banking_api_ui/src/components/Dashboard.js` - Add modal trigger for admin
- `banking_api_ui/src/components/LandingPage.js` or marketing page - Add modal trigger

---

## Notes

- The ApiCallDisplay.jsx component already exists and fetches API calls from `/api/api-calls`
- Need to ensure modal doesn't interfere with existing functionality
- Consider z-index management to ensure modal stays on top
- Test on different screen sizes and browsers
- Ensure accessibility (keyboard navigation for drag/resize)
