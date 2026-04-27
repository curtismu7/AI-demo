# Plan 236-01 Summary

**Status:** Complete
**Output:** findings-01.md

## Files reviewed
- `banking_api_server/services/appEventService.js`
- `banking_api_server/services/tokenIntrospectionService.js`
- `banking_api_server/middleware/tokenIntrospection.js`
- `banking_api_server/services/transactionAuthorizationService.js`
- `banking_api_server/services/mcpToolAuthorizationService.js`

## Finding counts
- Critical: 1
- Major: 6
- Minor: 13

## Key findings

The most serious issue is in `middleware/tokenIntrospection.js`: the introspection cache key is the first 20 characters of the raw bearer token (`token.substring(0, 20)`), which allows different tokens with a shared prefix to collide on the same cached introspection result — a security boundary failure that could falsely validate an inactive or wrong-user token. A second significant concern is that this middleware and `tokenIntrospectionService.js` each maintain separate `introspectionCache` Maps with different TTLs (60 s vs 30 s) and different credential sources, creating two inconsistent views of token validity and making cache invalidation unreliable. On the memory front, `tokenIntrospectionService.js`'s cache has no pruning mechanism at all — expired entries accumulate for the process lifetime — while the middleware's cache only evicts when it crosses 1,000 entries, and then does so on the hot request path (O(n)). `appEventService.js` is clean across all five dimensions.
