# Phase 103: Redesign /marketing Landing Page — Professional Layout, Clear CTA, Agent Integration

**Phase Number:** 103
**Depends On:** Phase 102 (split-pane + PingIdentity branding colors established)
**Scope:** Complete redesign of public `/marketing` (LandingPage) with professional layout, hero section, feature grid, clear calls-to-action, and integrated AI agent dock that matches page brand.

---

## Phase Vision

The `/marketing` page is the first impression for developers, architects, and decision-makers discovering the demo. Current state: placeholder-like, unclear value proposition, agent dock feels tacked-on.

**Desired outcome:** Professional, credible landing page that:
- Clearly explains what the demo showcases (RFC 8693 flows, MCP spec, AI-banking integration)
- Guides visitors to admin or customer login flows
- Surfaces the embedded agent as a feature, not a UI afterthought
- Uses PingIdentity branding (red accents, professional fonts, light grey backgrounds from Phase 85)
- Mobile-responsive (adapts agent dock for small screens)

---

## Design Decisions (Locked)

| ID | Decision | Rationale |
|---|----------|-----------|
| **D-103-01** | Hero section with headline, subheadline, and CTA buttons for "Admin" / "Customer" | Clear entry points for both roles; above-the-fold visibility |
| **D-103-02** | Feature grid (3-4 cards): Auth Flows, RFC 8693, MCP Integration, AI Agent | Communicate core demo value at a glance |
| **D-103-03** | Use light grey background (#F5F5F5 from Phase 85) for main content area | Consistent with dashboard styling; professional appearance |
| **D-103-04** | PingIdentity red (#b91c1c) for primary CTAs and accent elements | Brand consistency with Phase 102 split-pane design |
| **D-103-05** | Embedded agent dock at bottom-right (mobile: full-width above fold on small screens) | Non-intrusive, but surfaced as product feature |
| **D-103-06** | Header with logo, nav links, and quick login shortcuts | Professional header; enables future expansion (docs, API, blog links) |

---

## Requirements

- **MKT-01:** Hero section with compelling headline and role-based CTAs
- **MKT-02:** Feature grid showcasing 3-4 core demo capabilities
- **MKT-03:** Professional typography, spacing, color palette (PingIdentity + light grey)
- **MKT-04:** Responsive design (1024px desktop, 768px tablet, 360px mobile)
- **MKT-05:** Agent dock visually integrated (not floating over content) and mobile-friendly
- **MKT-06:** No console errors or placeholder content
- **MKT-07:** Accessibility (ARIA labels, color contrast, keyboard navigation)

---

## Deferred Ideas

- Blog section (future Phase 107)
- Testimonials or case studies (future Phase 108)
- API reference on landing (belongs in Phase 67 docs)
- Video walkthroughs (defer to Phase 109)

---

## Claude's Discretion

- Copy tone: Professional but approachable (not marketing-stuffy)
- Exact copy (/marketing page headlines) can be written during implementation
- Feature card order: put "Auth Flows" first, then RFC 8693, MCP, Agent
- CTA button text: "Try as Admin" / "Try as Customer" (vs. "Login Admin" / "Login User")

---

## Research Needed

- Current `/marketing` page state (LandingPage.js, styles)
- Existing CSS variables and theme from Phase 85 + Phase 102
- ExportedAgentDock integration patterns from existing pages
- Mobile breakpoint testing (360px, 768px, 1024px)

---

## Notes

- Agent dock must use `marketing` variant styling (EmbeddedAgentDock) from Phase 4 work, not dashboard styling
- Light grey background (#F5F5F5) already defined in index.css; apply via .landing-page-content class
- PingIdentity red (#b91c1c) already applied in Phase 102 components; reuse pattern
