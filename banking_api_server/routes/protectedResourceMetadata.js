/**
 * routes/protectedResourceMetadata.js
 *
 * Two route groups (shared buildMetadata helper):
 *
 *   GET /
 *     Used when mounted at /.well-known/oauth-protected-resource
 *     Public, no authentication required (RFC 9728 §3)
 *
 *   GET /metadata
 *     Same-origin proxy exposed at /api/rfc9728/metadata
 *     Allows the React UI to fetch the metadata without port-difference
 *     CORS issues in local development.
 *
 * RFC 9728 §3.2 response shape:
 *   resource                    REQUIRED
 *   authorization_servers       OPTIONAL (included when PINGONE_ENVIRONMENT_ID is set)
 *   bearer_methods_supported    OPTIONAL
 *   scopes_supported            RECOMMENDED
 *   resource_name               OPTIONAL
 *   resource_documentation      OPTIONAL
 */

const express = require('express');
const router  = express.Router();

/**
 * Build the RFC 9728 Protected Resource Metadata document.
 * @param {import('express').Request} req
 * @returns {object}
 */
function buildMetadata(req) {
  const baseUrl = process.env.PUBLIC_APP_URL ||
    `${req.protocol}://${req.get('host')}`;

  const envId  = process.env.PINGONE_ENVIRONMENT_ID || '';
  const region = process.env.PINGONE_REGION || 'com';
  const asList = envId
    ? [`https://auth.pingone.${region}/${envId}/as`]
    : [];

  const doc = {
    resource: `${baseUrl}/api`,
    bearer_methods_supported: ['header'],
    scopes_supported: [
      'banking:read',
      'banking:write',
      'banking:admin',
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
    ],
    resource_name: 'Super Banking Banking API',
    resource_documentation: 'https://datatracker.ietf.org/doc/html/rfc9728',
  };

  if (asList.length > 0) {
    doc.authorization_servers = asList;
  }

  return doc;
}

// GET / — served at /.well-known/oauth-protected-resource
router.get('/', (req, res) => {
  res.json(buildMetadata(req));
});

// GET /metadata — served at /api/rfc9728/metadata
router.get('/metadata', (req, res) => {
  res.json(buildMetadata(req));
});

module.exports = router;
