#!/usr/bin/env node

/**
 * verify-scope-configuration.js
 * 
 * Verifies that PingOne resources have the correct scopes attached.
 * Uses PingOne Management API to audit scope configuration.
 * 
 * Usage:
 *   node scripts/verify-scope-configuration.js [--fix]
 * 
 * Options:
 *   --fix    Attempt to auto-fix missing scopes (requires PINGONE_MGMT_CLIENT_ID/SECRET)
 * 
 * Environment:
 *   PINGONE_ENVIRONMENT_ID        — PingOne environment UUID
 *   PINGONE_MGMT_CLIENT_ID        — Management API worker app client ID
 *   PINGONE_MGMT_CLIENT_SECRET    — Management API worker app secret
 *   PINGONE_REGION                — PingOne region (default: com)
 *   PINGONE_RESOURCE_MCP_SERVER_URI     — MCP server resource URI (optional)
 *   PINGONE_RESOURCE_AGENT_GATEWAY_URI  — Agent gateway resource URI (optional)
 *   etc.
 */

'use strict';

// Load environment variables from .env file
require('dotenv').config();

const https = require('https');

// Color codes for output
const COLORS = {
  RESET: '\x1b[0m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
};

function log(...args) {
  console.log(...args);
}

function logError(msg) {
  console.error(`${COLORS.RED}❌ ${msg}${COLORS.RESET}`);
}

function logWarn(msg) {
  console.warn(`${COLORS.YELLOW}⚠️  ${msg}${COLORS.RESET}`);
}

function logSuccess(msg) {
  console.log(`${COLORS.GREEN}✅ ${msg}${COLORS.RESET}`);
}

function logInfo(msg) {
  console.log(`${COLORS.CYAN}ℹ️  ${msg}${COLORS.RESET}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Expected Scope Configuration
// ─────────────────────────────────────────────────────────────────────────────

const EXPECTED_SCOPES = {
  'banking-api': {
    description: 'Super Banking Banking API (End-User)',
    requiredScopes: ['banking:read', 'banking:write'],
    optionalScopes: [
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
      'banking:general:read',
      'banking:general:write',
    ],
  },
  'agent-gateway': {
    description: 'Super Banking Agent Gateway',
    requiredScopes: ['banking:agent:invoke', 'ai_agent'],
    optionalScopes: [],
  },
  'ai-agent': {
    description: 'Super Banking AI Agent Service',
    requiredScopes: ['banking:read', 'banking:write', 'banking:agent:invoke'],
    optionalScopes: [
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
    ],
  },
  'mcp-gateway': {
    description: 'Super Banking MCP Gateway',
    requiredScopes: ['banking:mcp:invoke', 'mcp_resource_access'],
    optionalScopes: [
      'banking:ai:agent:read',
      'banking:ai:agent:write',
    ],
  },
  'mcp-server': {
    description: 'Super Banking MCP Server',
    requiredScopes: [
      'get_accounts:read',
      'transfer:execute',
      'check:read',
    ],
    optionalScopes: [
      'banking:accounts:read',
      'banking:transactions:read',
      'banking:transactions:write',
      'banking:ai:agent:read',
      'banking:ai:agent:write',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// PingOne API Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function getManagementToken(clientId, clientSecret, region = 'com', envId) {
  return new Promise((resolve, reject) => {
    const hostname = `auth.pingone.${region}`;
    const path = `/${envId}/as/token`;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) {
            resolve(json.access_token);
          } else {
            reject(new Error(`No access_token in response: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse token response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write('grant_type=client_credentials&scope=p1:read:resource p1:read:resource_scope');
    req.end();
  });
}

async function listResources(envId, token, region = 'com') {
  return new Promise((resolve, reject) => {
    const hostname = `api.pingone.${region}`;
    const path = `/v1/environments/${envId}/resources`;

    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json._embedded?.resources || json.data || []);
        } catch (e) {
          reject(new Error(`Failed to parse resources response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getResourceScopes(envId, resourceId, token, region = 'com') {
  return new Promise((resolve, reject) => {
    const hostname = `api.pingone.${region}`;
    const path = `/v1/environments/${envId}/resources/${resourceId}/scopes`;

    const options = {
      hostname,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json._embedded?.scopes || json.data || []);
        } catch (e) {
          reject(new Error(`Failed to parse scopes response: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function createScope(envId, resourceId, scopeName, description, token, region = 'com') {
  return new Promise((resolve, reject) => {
    const hostname = `api.pingone.${region}`;
    const path = `/v1/environments/${envId}/resources/${resourceId}/scopes`;

    const payload = JSON.stringify({
      name: scopeName,
      description: description || `${scopeName} scope`,
    });

    const options = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 201 || res.statusCode === 200) {
            const json = JSON.parse(data);
            resolve(json);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to create scope: ${e.message}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Verification Logic
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');

  const envId = process.env.PINGONE_ENVIRONMENT_ID;
  const clientId = process.env.PINGONE_MGMT_CLIENT_ID;
  const clientSecret = process.env.PINGONE_MGMT_CLIENT_SECRET;
  const region = process.env.PINGONE_REGION || 'com';

  // Validate inputs
  if (!envId) {
    logError('PINGONE_ENVIRONMENT_ID not set');
    process.exit(1);
  }

  if (!clientId || !clientSecret) {
    logError('PINGONE_MGMT_CLIENT_ID or PINGONE_MGMT_CLIENT_SECRET not set');
    log('To create a worker app in PingOne:');
    log('  Admin → Applications → Create Application (type: Worker)');
    log('  Copy Client ID and Secret into .env as PINGONE_MGMT_CLIENT_ID and PINGONE_MGMT_CLIENT_SECRET');
    process.exit(1);
  }

  if (shouldFix && !clientId) {
    logError('--fix requires PINGONE_MGMT_CLIENT_ID and PINGONE_MGMT_CLIENT_SECRET');
    process.exit(1);
  }

  logInfo(`Environment: ${envId}`);
  logInfo(`Region: ${region}`);
  logInfo('');

  try {
    // Step 1: Get management token
    logInfo('Authenticating with PingOne Management API...');
    const token = await getManagementToken(clientId, clientSecret, region, envId);
    logSuccess('Authentication successful');
    log('');

    // Step 2: List all resources
    logInfo('Fetching PingOne resources...');
    const resources = await listResources(envId, token, region);
    logSuccess(`Found ${resources.length} resources`);
    log('');

    // Step 3: For each resource, list scopes and check against expected
    let totalIssues = 0;
    let resourceMap = {};

    for (const resource of resources) {
      const resourceId = resource.id;
      const resourceName = resource.name || '(unnamed)';
      // PingOne returns 'audience' for custom resources, not 'uri'
      const resourceUri = resource.audience || resource.uri || null;

      logInfo(`Checking: ${resourceName} (${resourceUri || 'no audience'})`);

      try {
        const scopes = await getResourceScopes(envId, resourceId, token, region);
        const scopeNames = scopes.map(s => s.name);

        const mapKey = resourceUri || resourceName;
        resourceMap[mapKey] = {
          id: resourceId,
          name: resourceName,
          audience: resourceUri,
          scopes: scopeNames,
        };

        // Check if this matches an expected resource type
        let matchedType = null;
        const nameLower = resourceName.toLowerCase();
        for (const [type, config] of Object.entries(EXPECTED_SCOPES)) {
          const typeWords = type.replace(/-/g, ' ');
          if (nameLower.includes(typeWords) ||
              (resourceUri && resourceUri.includes(type))) {
            matchedType = type;
            const { requiredScopes, optionalScopes, description } = config;

            log(`  ${COLORS.BLUE}Description:${COLORS.RESET} ${description}`);
            log(`  ${COLORS.BLUE}Audience:${COLORS.RESET}    ${resourceUri || '(none)'}`);
            log(`  ${COLORS.BLUE}Resource ID:${COLORS.RESET} ${resourceId}`);
            log(`  ${COLORS.BLUE}Scopes (${scopeNames.length}):${COLORS.RESET} ${scopeNames.length > 0 ? scopeNames.join(', ') : '(none)'}`);

            const missingRequired = requiredScopes.filter(s => !scopeNames.includes(s));
            const missingOptional = optionalScopes.filter(s => !scopeNames.includes(s));

            if (missingRequired.length > 0) {
              logWarn(`  Missing REQUIRED scopes: ${missingRequired.join(', ')}`);
              totalIssues++;

              if (shouldFix) {
                logInfo(`  Attempting to create missing scopes...`);
                for (const scope of missingRequired) {
                  try {
                    await createScope(envId, resourceId, scope, `${scope} scope`, token, region);
                    logSuccess(`    Created scope: ${scope}`);
                  } catch (e) {
                    logError(`    Failed to create scope ${scope}: ${e.message}`);
                  }
                }
              }
            } else {
              logSuccess(`  All required scopes present`);
            }

            if (missingOptional.length > 0) {
              logWarn(`  Missing OPTIONAL scopes: ${missingOptional.join(', ')}`);
              if (!shouldFix) {
                logInfo(`  (Run with --fix to auto-create)`);
              }
            }

            break;
          }
        }

        if (!matchedType) {
          log(`  ${COLORS.BLUE}Audience:${COLORS.RESET}    ${resourceUri || '(none)'}`);
          log(`  ${COLORS.BLUE}Scopes (${scopeNames.length}):${COLORS.RESET} ${scopeNames.length > 0 ? scopeNames.join(', ') : '(none)'}`);
          logInfo(`  (No expected configuration matched; skipping validation)`);
        }

        log('');
      } catch (e) {
        logError(`Failed to get scopes for ${resourceName}: ${e.message}`);
        totalIssues++;
      }
    }

    // Step 4: Summary
    log('');
    log('═'.repeat(70));
    if (totalIssues === 0) {
      logSuccess('✅ All scope configurations are correct!');
    } else {
      logWarn(`⚠️  Found ${totalIssues} issue(s) with scope configuration`);
    }
    log('═'.repeat(70));

    // Step 5: Output resource map for configStore
    log('');
    logInfo('Resource Configuration Summary:');
    log('');
    for (const [key, info] of Object.entries(resourceMap)) {
      log(`  Resource: ${info.name}`);
      log(`    Audience: ${info.audience || '(none)'}`);
      log(`    ID: ${info.id}`);
      log(`    Scopes: ${info.scopes.join(', ') || '(none)'}`);
      log('');
    }

    process.exit(totalIssues > 0 ? 1 : 0);
  } catch (e) {
    logError(`Fatal error: ${e.message}`);
    process.exit(1);
  }
}

// Run
main();
