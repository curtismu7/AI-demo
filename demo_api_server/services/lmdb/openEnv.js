'use strict';
const path = require('path');
const fs   = require('fs');
const { open } = require('lmdb');

const LMDB_PATH = path.join(__dirname, '../../data/persistent/lmdb');

let _env = null;
const _dbs = {};

function openEnv() {
  if (_env) return _env;
  fs.mkdirSync(LMDB_PATH, { recursive: true });
  _env = open({
    path: LMDB_PATH,
    maxDbs: 16,
    mapSize: 128 * 1024 * 1024,
    noSync: false,
  });
  return _env;
}

function getDb(name) {
  if (_dbs[name]) return _dbs[name];
  _dbs[name] = openEnv().openDB(name, { encoding: 'json' });
  return _dbs[name];
}

function closeEnv() {
  if (_env) {
    _env.close();
    _env = null;
    for (const k of Object.keys(_dbs)) { delete _dbs[k]; }
  }
}

module.exports = { openEnv, getDb, closeEnv, LMDB_PATH };
