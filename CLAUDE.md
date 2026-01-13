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

**idena-lite-api** is a lightweight REST API for the Idena blockchain built with Node.js/Express. It serves as a stateless caching proxy for Idena RPC nodes, providing a fast alternative to the centralized api.idena.io.

**Key Characteristics:**
- Stateless design (no database required)
- Optional Redis caching with graceful degradation
- Rate limiting (100 req/min per IP)
- Works with any Idena RPC node

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

# Run tests matching pattern
npm test -- --testNamePattern="health endpoint"

# Tests with coverage
npm run test:coverage

# Linting
npm run lint
npm run lint:fix

# Format code
npm run format
npm run format:check

# Docker
npm run docker:build
npm run docker:run  # docker-compose up -d
```

## Project Structure

```
src/
├── server.js        # Express entry point, middleware, route registration
├── rpc.js           # IdenaRPC class - JSON-RPC client for Idena node
├── cache.js         # Redis cache singleton with TTL support
├── swagger.js       # OpenAPI 3.0 specification
└── routes/
    ├── identity.js  # /api/identity/:address, /api/identity/:address/stake
    ├── balance.js   # /api/balance/:address
    ├── transaction.js # /api/transaction/:hash
    ├── block.js     # /api/block/:heightOrHash
    ├── epoch.js     # /api/epoch/current, /api/epoch/intervals
    └── health.js    # /api/health, /api/ping

tests/
└── *.test.js        # Jest + supertest API tests
```

## Architecture

### Request Flow

```
HTTP Request
  ↓
Rate Limiter (express-rate-limit, 100/min/IP)
  ↓
Security Headers (helmet)
  ↓
Route Handler
  ↓
Cache Check (redis via cache.js)
  ↓ (miss)
RPC Call (rpc.js → Idena node)
  ↓
Cache Store (TTL per endpoint)
  ↓
JSON Response
```

### Cache TTL Strategy

| Endpoint | TTL | Reason |
|----------|-----|--------|
| Identity | 300s | Balance/state changes infrequently |
| Balance | 300s | Same as identity |
| Transaction | 600s | Immutable once confirmed |
| Block | 600s | Immutable |
| Identities list | 120s | More volatile aggregate data |
| Epoch current | 60s | Changes during validation |
| Epoch intervals | 600s | Rarely changes |

### Key Classes

**IdenaRPC** (`src/rpc.js`):
```javascript
// Core JSON-RPC call method
async call(method, params = [])

// Convenience methods
getIdentity(address)      // dna_identity
getBalance(address)       // dna_getBalance
getTransaction(hash)      // bcn_transaction
getBlockByHeight(height)  // bcn_blockAt
getBlockByHash(hash)      // bcn_block
getEpoch()                // dna_epoch
getCeremonyIntervals()    // dna_ceremonyIntervals
getFilteredIdentities(filter)  // Paginated, filtered identities
```

**Cache** (`src/cache.js`):
```javascript
// Singleton pattern, auto-connects on require
await cache.get(key)
await cache.set(key, value, ttl)
await cache.delete(key)
cache.generateKey('prefix', ...parts)  // → "prefix:part1:part2"
```

## Development Workflow

### Adding a New Endpoint

1. Create route file in `src/routes/` (e.g., `contracts.js`)
2. Import dependencies:
   ```javascript
   const express = require('express');
   const IdenaRPC = require('../rpc');
   const cache = require('../cache');
   const router = express.Router();
   const rpc = new IdenaRPC();
   ```
3. Implement cache-first pattern:
   ```javascript
   router.get('/:address', async (req, res, next) => {
     try {
       const { address } = req.params;
       // Validate address format
       if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
         return res.status(400).json({ error: 'Invalid address format' });
       }

       const cacheKey = cache.generateKey('contract', address);
       let data = await cache.get(cacheKey);

       if (!data) {
         data = await rpc.call('bcn_contract', [address]);
         await cache.set(cacheKey, data, 300);
       }

       res.json({ result: data, cached: !!data });
     } catch (error) {
       next(error);
     }
   });
   ```
4. Add Swagger JSDoc annotations above route handler
5. Register in `src/server.js`:
   ```javascript
   const contractRoutes = require('./routes/contracts');
   app.use('/api/contract', contractRoutes);
   ```
6. Write tests in `tests/contracts.test.js`

### Adding RPC Methods

Edit `src/rpc.js` - add method to IdenaRPC class:
```javascript
getContract(address) {
  return this.call('bcn_contract', [address]);
}
```

## Configuration

### Required Environment Variables

```env
PORT=3000
IDENA_RPC_URL=http://localhost:9009  # or community: https://rpc.holismo.org
```

### Optional Environment Variables

```env
IDENA_API_KEY=           # For private nodes
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true       # Set false to disable caching
CACHE_TTL=300            # Default TTL in seconds
```

## CI/CD

GitHub Actions runs on push/PR to `main`:
- **Lint**: ESLint + Prettier check
- **Test**: Node.js 18, 20, 22 matrix; coverage on Node 20
- **Docker**: Build and verify container starts

## Testing Notes

- Tests run with `REDIS_ENABLED=false` (see `tests/setup.js`)
- Mock RPC responses using Jest mocks on axios
- Server exported as module for supertest integration tests
- Test file pattern: `tests/*.test.js`

Run specific test:
```bash
npm test -- tests/identity.test.js
npm test -- --testNamePattern="should return identity"
```

## Comparison with idena-indexer-api

Use **idena-lite-api** for: real-time data, simple deployment, prototypes
Use **idena-indexer-api** for: historical queries, analytics, full-text search

| Feature | idena-lite-api | idena-indexer-api |
|---------|----------------|-------------------|
| Database | None | PostgreSQL |
| Deployment | Minutes | Hours (sync) |
| Historical Data | No | Yes |
