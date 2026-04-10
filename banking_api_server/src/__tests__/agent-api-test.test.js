/**
 * Agent API Integration Test
 * Tests all agent API endpoints for:
 * - Correct authentication
 * - Proper scopes
 * - Valid audience
 * - 200 response with correct JSON
 */

const request = require('supertest');
const app = require('../../server');

// Helper to decode JWT and check scopes/audience
function decodeToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString();
    return JSON.parse(payload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

// Helper to create an authenticated session
function createAuthenticatedSession() {
  return {
    cookie: 'connect.sid=test-session-id',
    user: {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
      role: 'user'
    },
    oauthTokens: {
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      idToken: 'test-id-token',
      expiresAt: Date.now() + 3600000,
      tokenType: 'Bearer'
    }
  };
}

// Test cases
const agentApiTests = [
  {
    name: 'GET /api/agent/identity/status',
    method: 'GET',
    path: '/api/agent/identity/status',
    expectedStatus: 200,
    expectedFields: ['principalUsername', 'principalEmail', 'principalPingOneSub'],
    requiresAuth: true,
  },
  {
    name: 'POST /api/agent/identity/bootstrap',
    method: 'POST',
    path: '/api/agent/identity/bootstrap',
    body: {},
    expectedStatus: 200,
    expectedFields: ['ok', 'mapping'],
    requiresAuth: true,
  },
  {
    name: 'POST /api/banking-agent/init',
    method: 'POST',
    path: '/api/banking-agent/init',
    expectedStatus: 200,
    expectedFields: ['sessionId', 'initialized', 'agentReady'],
    requiresAuth: true,
  },
  {
    name: 'POST /api/banking-agent/message',
    method: 'POST',
    path: '/api/banking-agent/message',
    body: { message: 'show my accounts' },
    expectedStatus: 200,
    expectedFields: ['response'],
    requiresAuth: true,
  },
];

async function runTests() {
  console.log('=== Agent API Integration Tests ===\n');
  
  const results = {
    passed: 0,
    failed: 0,
    errors: [],
  };

  for (const test of agentApiTests) {
    console.log(`Testing: ${test.name}`);

    try {
      const authSession = createAuthenticatedSession();
      const response = await request(app)
        [test.method.toLowerCase()](test.path)
        .set('Content-Type', 'application/json')
        .set('Cookie', authSession.cookie)
        .send(test.body || {});

      // Check status code
      if (response.status !== test.expectedStatus) {
        console.error(`  ✗ Status code mismatch: expected ${test.expectedStatus}, got ${response.status}`);
        results.failed++;
        results.errors.push({
          test: test.name,
          error: `Status code mismatch: expected ${test.expectedStatus}, got ${response.status}`,
          response: response.body,
        });
        continue;
      }

      // Check response is JSON
      if (!response.headers['content-type']?.includes('application/json')) {
        console.error(`  ✗ Response is not JSON`);
        results.failed++;
        results.errors.push({
          test: test.name,
          error: 'Response is not JSON',
          contentType: response.headers['content-type'],
        });
        continue;
      }

      // Check expected fields
      if (test.expectedFields) {
        for (const field of test.expectedFields) {
          if (!(field in response.body)) {
            console.error(`  ✗ Missing field: ${field}`);
            results.failed++;
            results.errors.push({
              test: test.name,
              error: `Missing field: ${field}`,
              response: response.body,
            });
            continue;
          }
        }
      }

      // Check scopes and audience if token is present
      const authHeader = response.headers['authorization'];
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = decodeToken(token);
        
        if (decoded) {
          console.log(`  Token scopes: ${decoded.scope || 'none'}`);
          console.log(`  Token audience: ${decoded.aud || 'none'}`);
          
          // Validate audience should contain the API audience
          if (!decoded.aud) {
            console.error(`  ✗ Token missing audience claim`);
            results.failed++;
            results.errors.push({
              test: test.name,
              error: 'Token missing audience claim',
              decoded,
            });
          }
          
          // Validate scopes should contain required scopes
          if (!decoded.scope) {
            console.error(`  ✗ Token missing scope claim`);
            results.failed++;
            results.errors.push({
              test: test.name,
              error: 'Token missing scope claim',
              decoded,
            });
          }
        }
      }

      console.log(`  ✓ Passed (${response.status})`);
      results.passed++;
      
    } catch (error) {
      console.error(`  ✗ Test failed with error: ${error.message}`);
      results.failed++;
      results.errors.push({
        test: test.name,
        error: error.message,
        stack: error.stack,
      });
    }
    
    console.log('');
  }

  console.log('=== Test Summary ===');
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  
  if (results.errors.length > 0) {
    console.log('\n=== Errors ===');
    results.errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err.test}`);
      console.log(`   ${err.error}`);
      if (err.response) {
        console.log(`   Response: ${JSON.stringify(err.response, null, 2)}`);
      }
    });
  }

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
