'use strict';

/**
 * config.test.ts — regression test for the loopback host default.
 *
 * Fix #2: :3006 is loopback-only per REGRESSION_PLAN §3. The host default must
 * be 127.0.0.1 so a misconfigured deploy cannot expose the token-exchange
 * endpoint on all interfaces. An explicit HOST env still wins (staging/prod
 * can bind 0.0.0.0 deliberately) — mirrors the precedent set for the MCP
 * server in REGRESSION_PLAN §3070.
 */

import { loadConfig } from '../src/config';

describe('loadConfig host default', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  function withRequiredEnv(): void {
    process.env.AGENT_CLIENT_ID = 'test-client';
    process.env.MCP_GW_RESOURCE_URI = 'https://mcp-gw.example';
    process.env.PINGONE_TOKEN_ENDPOINT = 'https://auth.example/as/token';
  }

  it('defaults host to 127.0.0.1 (loopback) when HOST is unset', () => {
    delete process.env.HOST;
    withRequiredEnv();
    expect(loadConfig().host).toBe('127.0.0.1');
  });

  it('honors an explicit HOST override (staging/prod may bind 0.0.0.0)', () => {
    process.env.HOST = '0.0.0.0';
    withRequiredEnv();
    expect(loadConfig().host).toBe('0.0.0.0');
  });

  it('defaults port to 3006', () => {
    delete process.env.PORT;
    withRequiredEnv();
    expect(loadConfig().port).toBe(3006);
  });
});
