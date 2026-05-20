#!/usr/bin/env node
/**
 * Quick test script to trigger MCP token exchange and see what fails
 */
require('dotenv').config({ path: './demo_api_server/.env' });

const oauthService = require('./demo_api_server/services/oauthService');

async function test() {
  try {
    console.log('[TEST] Attempting MCP Exchanger Token...');
    const svc = oauthService;
    
    // Try to get the token
    const token = await svc.getMcpExchangerToken();
    console.log('[TEST] ✅ SUCCESS! Token obtained:', token.substring(0, 50) + '...');
  } catch (err) {
    console.error('[TEST] ❌ FAILED!');
    console.error('Error message:', err.message);
    console.error('Full error:', err);
  }
}

test();
