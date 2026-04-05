---
description: GSD Verify - Verification and quality assurance
---

# GSD Verify Workflow

## Purpose
Systematic verification and quality assurance for completed work, milestones, or phases.

## When to Use
- After completing a phase or milestone
- Before merging significant changes
- For quality assurance checks
- When preparing for releases
- To ensure work meets standards

## Steps

### 1. Verification Planning
// turbo
Define verification scope and criteria:
```bash
echo "Planning verification approach..."
```

### 2. Code Quality Check
- **Linting**: Run code quality tools
- **Type Checking**: Verify type safety
- **Standards**: Check coding standards compliance
- **Documentation**: Verify documentation completeness

### 3. Functional Testing
- **Unit Tests**: Run unit test suites
- **Integration Tests**: Verify component integration
- **End-to-End**: Test complete user flows
- **Edge Cases**: Test boundary conditions

### 4. Performance Verification
- **Load Testing**: Check performance under load
- **Memory Usage**: Verify memory efficiency
- **Response Times**: Check acceptable response times
- **Scalability**: Test scaling behavior

### 5. Security Review
- **Vulnerabilities**: Scan for security issues
- **Authentication**: Verify auth mechanisms
- **Authorization**: Check access controls
- **Data Protection**: Verify data security

### 6. Documentation Review
- **Completeness**: Check documentation coverage
- **Accuracy**: Verify technical accuracy
- **Usability**: Ensure documentation is usable
- **Updates**: Update with latest changes

## Expected Outcome
- Verified code quality and functionality
- Comprehensive test coverage
- Performance and security validation
- Complete and accurate documentation

## Notes
- Use automated tools where possible
- Document all verification results
- Address issues before proceeding
- Maintain verification records
