# Phase 64: Unified Configuration Page

## Description

This phase addresses the current fragmentation of configuration across two separate pages (`/demo-data` and `/config`) that creates confusion for users and leads to inconsistent configuration management. The goal is to create a single, unified configuration page that provides comprehensive control over all demo settings in one location.

Currently, users must bounce between pages to configure related functionality:
- Token auth method on `/demo-data` but client IDs on `/config`
- Demo scenario settings split across pages
- No clear audit of which configStore keys are exposed via UI
- Potential orphaned settings that are configurable in code but not accessible via UI

## Key Issues Addressed

1. **User Experience Fragmentation**: Two separate configuration pages create cognitive overhead and make it difficult to understand the full configuration landscape

2. **Configuration Coverage Gaps**: Some configStore keys may be accessible via API but not exposed in UI, while others may have UI controls but no backend implementation

3. **Inconsistent State Management**: Different pages may handle state persistence, validation, and error reporting differently

4. **Discoverability Problems**: Important settings may be hidden on the wrong page, making them hard to find

## Dependencies

- Phase 5: user-documentation (for updating configuration documentation)
- Phase 62: token-exchange-critical-fixes-and-enhancements (for token auth method configuration)

## Deliverables

- Unified `/settings` or `/admin/config` page with organized sections
- Complete audit of configStore keys and UI coverage
- Consolidated API endpoints for configuration management
- Updated documentation reflecting the new configuration structure
- Removal or redirection of old `/demo-data` and `/config` routes

## Estimated Duration

3-4 days (due to comprehensive audit and careful migration)

## Success Criteria

1. All configuration settings accessible from a single, well-organized page
2. 100% audit coverage of configStore keys with corresponding UI controls
3. Seamless migration from existing pages with no data loss
4. Improved user experience with logical grouping and clear section organization
5. Consistent validation, error handling, and success feedback across all settings
