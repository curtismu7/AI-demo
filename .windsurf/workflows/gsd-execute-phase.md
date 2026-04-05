---
description: GSD Execute Phase - Execute planned development phases
---

# GSD Execute Phase Workflow

## Purpose
Execute pre-planned development phases with multiple related tasks and coordinated implementation.

## When to Use
- Implementing a planned phase from .planning/STATE.md
- Coordinating multiple related features
- Complex multi-component changes
- Phase-based development with clear objectives

## Steps

### 1. Phase Preparation
// turbo
Load and validate the phase plan:
```bash
echo "Loading phase plan..."
cat .planning/STATE.md | grep -A 10 "Phase:"
```

### 2. Task Breakdown
- **Review**: Examine all todos for the phase
- **Prioritize**: Order tasks by dependencies
- **Plan**: Create implementation sequence
- **Validate**: Ensure all requirements are clear

### 3. Systematic Implementation
For each task in the phase:
- **Execute**: Implement according to specifications
- **Test**: Verify each component works
- **Integrate**: Ensure compatibility with other phase components
- **Document**: Record progress and decisions

### 4. Phase Integration
- **Combine**: Integrate all phase components
- **Test**: End-to-end phase functionality
- **Validate**: Verify phase objectives met
- **Review**: Quality check and regression testing

### 5. Phase Completion
- **Update**: Mark phase as complete in STATE.md
- **Archive**: Move phase todos to completed
- **Document**: Update phase documentation
- **Prepare**: Set up for next phase

## Expected Outcome
- Complete phase implementation
- All phase objectives achieved
- Integrated, tested functionality
- Clear documentation and progression

## Notes
- Follow phase specifications exactly
- Test integration points carefully
- Update planning documents promptly
- Coordinate with other team members if applicable
