# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Guidelines

**IMPORTANT: This is a public, community-maintained project that MUST remain anonymous.**

### Anonymity Requirements
- **ALL commits** must be authored by "Idena Community <communityidena@gmail.com>"
- **NEVER** include personal names, emails, or identifying information in commits, code comments, or documentation
- Git config before any commit:
  ```bash
  git config user.name "Idena Community"
  git config user.email "communityidena@gmail.com"
  ```

## Project Overview

**idena-lite-api** is a lightweight REST API for the Idena blockchain built with Node.js/Express. It provides two operation modes:

### Mode 1: Real-time Only (Default)
- Stateless caching proxy for Idena RPC nodes
- No database required, deploys in minutes
- Redis caching with graceful degradation

### Mode 2: With Historical Sync (`HISTORY_ENABLED=true`)
- Background sync to SQLite database
- Transaction history per address
- Historical block/transaction lookup
- Epoch & identity state tracking
- Rewards & validation data
- Full-text search (FTS5)
- Smart contract tracking
- ~2-4 hours initial sync (vs 100+ hours for full indexer)

## What idena-lite-api CAN Do

### Real-time Queries (from RPC)
- ✅ Get identity state and age (`/api/identity/:address`)
- ✅ Get balance and stake (`/api/balance/:address`)
- ✅ Get current epoch info (`/api/epoch/current`)
- ✅ Get ceremony intervals (`/api/epoch/intervals`)
- ✅ Get recent transactions by hash (`/api/transaction/:hash`)
- ✅ Get recent blocks by height/hash (`/api/block/:heightOrHash`)
- ✅ List identities with filtering (`/api/identities`)

### Historical Queries (from SQLite, requires `HISTORY_ENABLED=true`)
- ✅ Get transaction history for address (`/api/history/address/:addr/transactions`)
- ✅ Get historical blocks (`/api/history/block/:height`)
- ✅ Get historical transactions (`/api/history/transaction/:hash`)
- ✅ Check sync status (`/api/history/status`)
- ✅ Epoch data and identity states (`/api/epoch/:epoch`, `/api/history/identity/:addr/epochs`)
- ✅ Rewards and validation results (`/api/history/identity/:addr/rewards`)
- ✅ Balance change history (`/api/address/:addr/balance/changes`)
- ✅ Invite tracking (`/api/history/identity/:addr/invites`)
- ✅ Network statistics (`/api/stats/online`, `/api/stats/coins`)
- ✅ Full-text search (`/api/search?q=...`, `/api/search/addresses`, `/api/search/transactions`)
- ✅ Smart contract queries (`/api/contract`, `/api/contract/:addr`, `/api/contract/:addr/calls`)

## What idena-lite-api CANNOT Do

- ❌ Flip content retrieval (IPFS images and answers)
- ❌ Complex analytics (advanced aggregations and trends)

**Need these features?** Use [idena-indexer-api](https://github.com/idena-network/idena-indexer-api) (requires PostgreSQL, 100+ hours sync).

## Common Commands

```bash
# Install dependencies
npm install

# Development (hot reload via nodemon)
npm run dev

# Production
npm start

# Run all tests
npm test

# Run single test file
npm test -- tests/identity.test.js

# Tests with coverage (currently 96%+)
npm run test:coverage

# Linting
npm run lint
npm run lint:fix

# Docker
npm run docker:build
npm run docker:run
```

## Project Structure

```
src/
├── server.js        # Express entry point, middleware, route registration
├── rpc.js           # IdenaRPC class - JSON-RPC client for Idena node
├── cache.js         # Redis cache singleton with TTL support
├── db.js            # SQLite database layer for historical queries
├── sync.js          # Background sync service (RPC → SQLite)
├── swagger.js       # OpenAPI 3.0 specification
└── routes/
    ├── identity.js  # /api/identity/:address, /api/identity/:address/stake
    ├── balance.js   # /api/balance/:address
    ├── transaction.js # /api/transaction/:hash
    ├── block.js     # /api/block/:heightOrHash
    ├── epoch.js     # /api/epoch/current, /api/epoch/:epoch, /api/epochs
    ├── health.js    # /api/health, /api/ping
    ├── history.js   # /api/history/* (historical queries)
    ├── address.js   # /api/address/:addr (balance changes, penalties)
    ├── stats.js     # /api/stats/* (network statistics)
    ├── search.js    # /api/search/* (full-text search)
    └── contract.js  # /api/contract/* (smart contracts)

data/
└── history.db       # SQLite database (created automatically)

tests/
├── *.test.js        # Jest + supertest API tests
├── db.test.js       # HistoryDB unit tests
└── sync.test.js     # SyncService unit tests
```

## Architecture

### Request Flow (Real-time)

```
HTTP Request
  ↓
Rate Limiter (100/min/IP)
  ↓
Security Headers (helmet)
  ↓
Route Handler
  ↓
Cache Check (Redis)
  ↓ (miss)
RPC Call (rpc.js → Idena node)
  ↓
Cache Store (TTL per endpoint)
  ↓
JSON Response
```

### Request Flow (Historical)

```
HTTP Request
  ↓
Rate Limiter
  ↓
Route Handler (history.js)
  ↓
SQLite Query (db.js)
  ↓
JSON Response
```

### Background Sync Flow

```
SyncService (sync.js)
  ↓
Get chain height from RPC
  ↓
Fetch blocks in parallel (20 concurrent)
  ↓
Fetch transactions per block
  ↓
Batch insert to SQLite (db.js)
  ↓
Update sync status
  ↓
Sleep, repeat
```

## Key Classes

### IdenaRPC (`src/rpc.js`)
```javascript
async call(method, params = [])  // Core JSON-RPC call
getIdentity(address)             // dna_identity
getBalance(address)              // dna_getBalance
getTransaction(hash)             // bcn_transaction
getBlockByHeight(height)         // bcn_blockAt
getBlockByHash(hash)             // bcn_block
getEpoch()                       // dna_epoch
getCeremonyIntervals()           // dna_ceremonyIntervals
```

### HistoryDB (`src/db.js`)
```javascript
init()                           // Create schema, indexes
getSyncStatus()                  // Get sync progress
getAddressTransactions(addr, opts) // Paginated tx history
getBlock(height)                 // Get block by height
getTransaction(hash)             // Get tx by hash
insertBatch(blocks, txs)         // Batch insert
getStats()                       // Block/tx/contract counts

// Epoch & Identity
getEpoch(epoch)                  // Get epoch details
getEpochs(opts)                  // List epochs (paginated)
getIdentityStates(addr, opts)    // Identity state history
getIdentityStateAtEpoch(addr, epoch) // State at specific epoch

// Rewards & Validation
getRewards(addr, opts)           // Reward history
getValidationResults(addr, opts) // Validation ceremony results

// Search (FTS5)
search(query, opts)              // Search all types
searchAddresses(prefix)          // Search addresses by prefix
searchTransactions(prefix)       // Search tx by hash prefix
searchBlocks(query)              // Search blocks by height/hash

// Contracts
getContract(addr)                // Get contract details
getContracts(opts)               // List contracts (paginated)
getContractCalls(addr, opts)     // Contract call history
getContractStats()               // Contract statistics
```

### SyncService (`src/sync.js`)
```javascript
start()                          // Begin background sync
stop()                           // Stop sync
getStatus()                      // Get sync status + db stats
_syncBatch()                     // Sync one batch of blocks
_fetchBlock(height)              // Fetch single block
_fetchTransaction(hash, ...)     // Fetch single tx
```

### Cache (`src/cache.js`)
```javascript
await cache.get(key)
await cache.set(key, value, ttl)
await cache.delete(key)
cache.generateKey('prefix', ...parts)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `IDENA_RPC_URL` | Idena node RPC endpoint | `http://localhost:9009` |
| `IDENA_API_KEY` | API key for Idena node | - |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Redis password | - |
| `REDIS_ENABLED` | Enable Redis caching | `true` |
| `CACHE_TTL` | Default cache TTL (seconds) | `300` |
| `HISTORY_ENABLED` | Enable historical sync | `true` |
| `SQLITE_PATH` | SQLite database path | `./data/history.db` |
| `SYNC_BATCH_SIZE` | Blocks per sync batch | `500` |
| `SYNC_INTERVAL` | Delay between batches (ms) | `1000` |
| `SYNC_CONCURRENCY` | Parallel RPC requests | `20` |

### Sync Performance Tuning

| Setting | Conservative | Default | Aggressive |
|---------|-------------|---------|------------|
| `SYNC_BATCH_SIZE` | 100 | 500 | 1000 |
| `SYNC_INTERVAL` | 5000 | 1000 | 500 |
| `SYNC_CONCURRENCY` | 5 | 20 | 50 |

## Testing

```bash
# Run all tests (466 tests)
npm test

# Run with coverage (97%+)
npm run test:coverage

# Run specific test file
npm test -- tests/history.test.js
npm test -- tests/db.test.js
npm test -- tests/sync.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should return identity"
```

### Test Files
- `server.test.js` - Server setup, middleware
- `rpc.test.js` - RPC client unit tests
- `cache.test.js` - Redis cache tests
- `health.test.js` - Health endpoint tests
- `identity.test.js` - Identity endpoints
- `balance.test.js` - Balance endpoints
- `transaction.test.js` - Transaction endpoints
- `block.test.js` - Block endpoints
- `epoch.test.js` - Epoch endpoints (+ historical epochs)
- `history.test.js` - Historical endpoints
- `address.test.js` - Address endpoints (balance changes, penalties)
- `stats.test.js` - Network statistics endpoints
- `search.test.js` - Full-text search endpoints
- `contract.test.js` - Smart contract endpoints
- `db.test.js` - HistoryDB unit tests
- `sync.test.js` - SyncService unit tests
- `rateLimit.test.js` - Rate limiting
- `integration.test.js` - End-to-end tests

## API Comparison

| Feature | idena-lite-api | idena-lite-api + history | idena-indexer-api |
|---------|----------------|--------------------------|-------------------|
| Current identity/balance | ✅ | ✅ | ✅ |
| Transaction history | ❌ | ✅ | ✅ |
| Historical identity states | ❌ | ✅ | ✅ |
| Past epoch data | ❌ | ✅ | ✅ |
| Rewards & validation | ❌ | ✅ | ✅ |
| Balance change history | ❌ | ✅ | ✅ |
| Invite tracking | ❌ | ✅ | ✅ |
| Network statistics | ❌ | ✅ | ✅ |
| Full-text search | ❌ | ✅ | ✅ |
| Smart contract queries | ❌ | ✅ | ✅ |
| Flip content | ❌ | ❌ | ✅ |
| **Deployment time** | Minutes | 2-4 hours | 100+ hours |
| **Database** | None | SQLite (~10GB) | PostgreSQL (~100GB) |
| **Sync speed** | N/A | ~12,000 blocks/min | ~1,000 blocks/min |

## Development Workflow

### Adding a New Endpoint

1. Create route file in `src/routes/`
2. Implement route handler with validation
3. Add Swagger JSDoc annotations
4. Register in `src/server.js`
5. Write tests in `tests/`

### Adding Historical Data

1. Update schema in `db.js` `_createSchema()`
2. Add getter method in `db.js`
3. Update sync logic in `sync.js` if needed
4. Add route handler in `routes/history.js`
5. Write tests

## CI/CD

GitHub Actions runs on push/PR to `main`:
- **Lint**: ESLint + Prettier check
- **Test**: Node.js 18, 20, 22 matrix; coverage on Node 20
- **Docker**: Build and verify container starts
