# Phase 148: Redesign AI Agent chat UI — compact layout, grouped chips, visible prompt field — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-14
**Phase:** 148-redesign-ai-agent-chat-ui-compact-layout-grouped-chips-visible-prompt-field
**Areas discussed:** Chip Grouping, Compact Layout Definition, Prompt Field Visibility, Message Display, Real Estate Balance

---

## Area 1: Chip Grouping Strategy

**Question:** How should the action buttons (currently flat vertical list) be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| By use case | Read operations vs. Write operations | |
| By frequency | Primary/common vs. Secondary | |
| By category | Account, Transaction, Admin groups | ✓ |
| No grouping | Keep flat but improve density | |

**User's choice:** By category (Account operations, Transaction operations, Admin)

**Notes:** User selected option 3 (by category). This matches banking UI patterns users are already familiar with (Chase, Wells Fargo, etc.)

---

## Area 2: Compact Layout Definition

**Question:** What does "compact" mean — smaller buttons, multi-column grid, collapsible groups, or simplified emoji-only?

| Option | Description | Selected |
|--------|-------------|----------|
| Smaller buttons with reduced padding | Tighter spacing, same layout structure | |
| Multi-column grid for chips | 2-3 columns per category group | |
| Collapsible category groups | Headers shown, groups collapse on demand | |
| Simplified emoji chips | Icon buttons only, no text labels | |

**User's choice:** Collapsible category groups + simplified emoji chips (combination of options 3 and 4)

**Notes:** Collapsible groups save space immediately. Emoji-only reduces visual clutter. Combined approach gives flexibility.

---

## Area 3: Rendering Layout

**Question:** How should the agent render on the dashboard?

**User's choice:** [From earlier context] Inline split-column layout like middle agent (follow Phase 147 pattern)

**Notes:** Maintains consistency with established agent placement modes. User specified "follow the middle format as we did with right agent."

---

## Area 4: Prompt Field Visibility

**Question:** How should the prompt input be treated?

| Option | Description | Selected |
|--------|-------------|----------|
| Always visible at bottom | Pinned, visible when scrolled | ✓ |
| Sticky above chat | Moved above messages | |
| Prompt suggestions visible | Autocomplete/suggestions shown | |
| Chips share space with input | Collapsible to maximize input | |

**User's choice:** Always visible at bottom, made more prominent

**Notes:** User wants input prominent and consistently accessible — classic chat interface pattern.

---

## Area 5: Message Display in Compact Mode

**Question:** How should chat messages display in compact mode?

| Option | Description | Selected |
|--------|-------------|----------|
| Standard density | Keep size, just get more on screen | |
| Condensed messages | Reduce line-height, smaller font, tighter spacing | ✓ |
| Compact message bubbles | Smaller padding, minimal icons | |
| Message threading | Group related messages with collapse toggles | |

**User's choice:** Condensed messages (option 2)

**Notes:** Increases message visibility on screen while maintaining readability. Simpler than threading.

---

## Area 6: Balance — Collapsible Groups Default State

**Question:** Should category groups start expanded or collapsed?

| Option | Description | Selected |
|--------|-------------|----------|
| Collapsed by default | Maximizes chat area immediately | |
| Expanded by default | Chips prominent, less chat space | |
| Smart default | Account expanded, others collapsed | ✓ |
| Context-based | Different defaults per placement mode | |

**User's choice:** Smart default (Account expanded, others collapsed) + localStorage persistence

**Notes:** Account operations are most common. Others available if needed. User choice remembered across page reloads.

---

## Implementation Constraints Noted

- Consistency with Phase 147 established patterns (left-dock removed, right/middle agents inline)
- Existing localStorage patterns for state persistence
- Chase.com UI as visual reference
- Keep ba-left-col (left column) functionality intact across all modes

---

## the Agent's Discretion

Areas where the agent has flexibility:
- Specific emoji choices per action (🏦 vs 💼 for accounts, etc.)
- Exact CSS values for condensed display (font-size, line-height, padding)
- Hover tooltip text for emoji buttons
- Grid/flexbox proportions for split-column layout (will refine during implementation based on visual balance)

---

*Phase: 148*
*Discussion Date: 2026-04-14*
*All decisions locked and ready for planning*
