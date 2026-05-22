'use strict';
/**
 * openEnv — shared LMDB environment for all sub-databases.
 *
 * All named databases live in data/persistent/lmdb/ (one directory, multiple
 * named sub-DBs). Call openEnv() to get the root env, then env.openDB(name)
 * for each sub-DB.
 *
 * NOT wired into the app. Imported only by lmdb/* adapters.
 */
const path = require('path');
const fs   = require('fs');
const { open } = require('lmdb');

const LMDB_PATH = path.join(__dirname, '../../data/persistent/lmdb');

let _env = null;

function openEnv() {
  if (_env) return _env;
  fs.mkdirSync(LMDB_PATH, { recursive: true });
  _env = open({
    path: LMDB_PATH,
    maxDbs: 12,
    mapSize: 128 * 1024 * 1024, // 128 MB — plenty for local dev
    noSync: false,               // crash-safe
  });
  return _env;
}

function closeEnv() {
  if (_env) { _env.close(); _env = null; }
}

module.exports = { openEnv, closeEnv, LMDB_PATH };
