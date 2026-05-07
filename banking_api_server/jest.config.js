module.exports = {
  testEnvironment: 'node',
  // uuid v9+ is ESM-only; Jest runs CJS — redirect to a minimal CJS shim.
  moduleNameMapper: {
    '^uuid$': '<rootDir>/src/__tests__/__mocks__/uuid-cjs.js',
  },
  // CI runs many suites in parallel across packages; cap workers to reduce flaky supertest/socket errors.
  ...(process.env.CI === 'true' ? { maxWorkers: 2 } : {}),
  // Runs setup.js before each test file so env vars (SKIP_TOKEN_SIGNATURE_VALIDATION,
  // DEBUG_TOKENS, etc.) are set before any module is require()'d by the test.
  // globalSetup runs once before all suites. Loads .env.test-tokens if present
  // (written by scripts/extract-browser-token.js after a browser login).
  globalSetup: '<rootDir>/src/__tests__/setup/loadBrowserToken.js',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'],
  collectCoverageFrom: [
    'middleware/**/*.js',
    'routes/**/*.js',
    'services/**/*.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/src/__tests__/**/*.test.js',
    '**/tests/**/*.test.js',
  ],
  reporters: [
    'default',
    '<rootDir>/src/__tests__/setup/markdownReporter.js',
  ],
  verbose: true,
  silent: true // Suppress console output during tests
};