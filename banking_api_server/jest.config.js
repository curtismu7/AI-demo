module.exports = {
  testEnvironment: 'node',
  // CI runs many suites in parallel across packages; cap workers to reduce flaky supertest/socket errors.
  maxWorkers: process.env.CI === 'true' ? 2 : undefined,
  // Runs setup.js before each test file so env vars (SKIP_TOKEN_SIGNATURE_VALIDATION,
  // DEBUG_TOKENS, etc.) are set before any module is require()'d by the test.
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  collectCoverageFrom: [
    'middleware/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/src/__tests__/**/*.test.js'
  ],
  verbose: true,
  silent: true // Suppress console output during tests
};