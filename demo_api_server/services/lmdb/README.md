# LMDB Storage Layer

Drop-in replacements for all 6 SQLite databases. **Not wired into the app.**
Run migration first, then swap imports per the table below.

## Migration

Stop the server, then:

```bash
node demo_api_server/services/lmdb/migrate.js
```

Idempotent — safe to re-run. Does not modify SQLite files.

## Wire-in guide (when ready)

| SQLite module | LMDB replacement | Change in |
|---|---|---|
| `services/configStore.js` `_getSQLite()` | `configStore.lmdb.js` `{ loadAll, upsert, remove }` | `configStore.js` ~line 430 |
| `services/sqliteSessionStore.js` | `sessionStore.lmdb.js` `{ LmdbSessionStore }` | `server.js` ~line 54 |
| `services/bankingDb.js` | `bankingDb.lmdb.js` same API | all `require('./bankingDb')` callers |
| `data/store.js` SQLite layer | `transactionStore.lmdb.js` `{ persistTransaction, loadTransactions }` | `data/store.js` `_initializeSQLiteTransactions()` |
| `services/delegationService.js` SQLite branch | `delegationStore.lmdb.js` same API | `delegationService.js` `getStorage()` |
| `services/demoDataService.js` | `demoAccountStore.lmdb.js` same API | `demoDataService.js` module-level init |

## Data directory

All LMDB data lives in `demo_api_server/data/persistent/lmdb/` (two files: `data.mdb`, `lock.mdb`).
Add this path to backups alongside the existing `.db` files.
