'use strict';

const https = require('https');
const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const SESSION_CACHE  = path.resolve(__dirname, '../../../.test-session.json');
const FIXTURES_CACHE = path.resolve(__dirname, '../../../.test-fixtures.json');
const BFF_BASE       = 'https://api.ping.demo:3001';
const httpsAgent     = new https.Agent({ rejectUnauthorized: false });

let _previousVertical = 'banking';

function loadSession(persona = 'enduser') {
  if (!fs.existsSync(SESSION_CACHE)) throw new Error('No .test-session.json — run globalSetup first');
  const cache = JSON.parse(fs.readFileSync(SESSION_CACHE, 'utf8'));
  const cookie = cache[persona];
  if (!cookie || cookie === 'skip') throw new Error(`No valid session for persona '${persona}'`);
  return cookie;
}

function createBffClient(persona = 'enduser') {
  const cookie = loadSession(persona);
  return axios.create({
    baseURL: BFF_BASE,
    httpsAgent,
    headers: { Cookie: cookie },
    validateStatus: () => true, // let tests assert status codes
  });
}

async function setVertical(client, verticalId) {
  const current = await client.get('/api/config/vertical');
  _previousVertical = current.data?.activeVertical || 'banking';
  await client.put('/api/config/vertical', { verticalId });
}

async function restoreVertical(client) {
  await client.put('/api/config/vertical', { verticalId: _previousVertical });
}

function loadFixtures() {
  if (!fs.existsSync(FIXTURES_CACHE)) throw new Error('No .test-fixtures.json — run globalSetup first');
  return JSON.parse(fs.readFileSync(FIXTURES_CACHE, 'utf8'));
}

module.exports = { createBffClient, setVertical, restoreVertical, loadFixtures, BFF_BASE };
