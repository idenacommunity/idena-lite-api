# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Repository Guidelines

**IMPORTANT: This is a public, ongoing, community-maintained project that MUST remain anonymous.**

### Anonymity Requirements
- **ALL commits** must be authored by "Idena Community <communityidena@gmail.com>"
- **NEVER** include personal names, emails, or identifying information in commits, code comments, or documentation
- **ALWAYS** use the anonymous SSH key (`~/.ssh/id_ed25519_idenacommunity`) when pushing changes
- Git configuration must be set to anonymous credentials before any commit:
  ```bash
  git config user.name "Idena Community"
  git config user.email "communityidena@gmail.com"
  ```

### Project Status
- **Visibility**: Public repository on GitHub (https://github.com/idenacommunity/idena-lite-api)
- **Status**: Alpha (0.1.0-alpha), ongoing development
- **Maintenance**: Community-maintained by anonymous contributors
- **Contributions**: All contributions welcome, but must follow anonymity guidelines
- **Purpose**: Decentralized alternative to centralized api.idena.io

### When Working on This Project
1. Always verify git config before committing
2. Use anonymous commit messages
3. Never reference personal projects or identities
4. Keep focus on community benefit and decentralization
5. Document clearly for future anonymous contributors
6. Consider privacy implications when adding features

## Project Overview

**idena-lite-api** is a lightweight, community-maintained REST API for the Idena blockchain built with Node.js/Express. It serves as a stateless caching proxy for Idena RPC nodes, providing a fast and easy-to-deploy alternative to the centralized api.idena.io.

**Purpose:** Decentralized, community-owned API infrastructure that works with any Idena RPC node. Enables rapid deployment without database dependencies.

**Key Features:**
- Fast, cached responses via Redis
- Works with any Idena RPC node (local, VPS, or community)
- Deploys in minutes with Docker
- Stateless design (no database required)
- Horizontal scaling with shared Redis
- Rate limiting (100 req/min per IP)
- Minimal dependencies

**Deployment Cost:** ~€5/month on Hetzner VPS or free tier on Railway/Fly.io

## Project Structure

```
src/
├── server.js           # Express server entry point, middleware setup, route registration
├── rpc.js              # Idena RPC client (axios-based JSON-RPC calls)
├── cache.js            # Redis caching singleton with TTL support
├── swagger.js          # OpenAPI 3.0 specification for Swagger UI
└── routes/
    ├── identity.js     # GET /api/identity/:address, /api/identity/:address/stake, /api/identity
    ├── balance.js      # GET /api/balance/:address
    ├── transaction.js  # GET /api/transaction/:hash
    ├── block.js        # GET /api/block/:heightOrHash
    ├── epoch.js        # GET /api/epoch/current, /api/epoch/intervals
    └── health.js       # GET /api/health, /api/ping

tests/
└── *.test.js           # Jest + supertest API tests

.github/
├── workflows/ci.yml    # GitHub Actions CI pipeline
└── dependabot.yml      # Automated dependency updates

eslint.config.js        # ESLint 9 flat config
```

## CI/CD

GitHub Actions runs on every push and pull request to `main`:

- **Lint**: ESLint + Prettier format check
- **Test**: Runs on Node.js 18, 20, 22 with coverage report on Node 20
- **Docker**: Builds image and verifies it starts correctly

Dependabot automatically creates PRs for dependency updates weekly.

## Common Commands

### Setup & Running
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit configuration (set IDENA_RPC_URL)
nano .env

# Run in development mode (with hot reload via nodemon)
npm run dev

# Run in production mode
npm start
```

### Testing
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting & Formatting
```bash
# Run ESLint
npm run lint

# Run ESLint with auto-fix
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting without writing
npm run format:check
```

### Docker
```bash
# Build Docker image
npm run docker:build
# or
docker build -t idena-lite-api:latest .

# Run with Docker Compose (includes Redis)
npm run docker:run
# or
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down

# Check health
curl http://localhost:3000/api/health
```

## Configuration

### Environment Variables (.env)

**Required:**
```env
PORT=3000
IDENA_RPC_URL=http://localhost:9009
```

**Optional:**
```env
# Redis configuration
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
CACHE_TTL=300

# API Key (optional, for private node)
IDENA_API_KEY=your-api-key

# Rate limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

### Using Community RPC Nodes

Don't want to run your own node? Use community infrastructure:

```env
# Option 1: holismo.org
IDENA_RPC_URL=https://rpc.holismo.org

# Option 2: idio.network
IDENA_RPC_URL=https://rpc.idio.network

# Option 3: Docker RPC
# docker run -d -p 9009:9009 idena/rpc
IDENA_RPC_URL=http://localhost:9009
```

## Architecture

### Stateless Caching Proxy

```
HTTP Request
  ↓
Rate Limiter (100 req/min per IP)
  ↓
CORS & Security Headers (Helmet.js)
  ↓
Route Handler
  ↓
Cache Check (Redis via cache.js)
  ↓ (cache miss)
RPC Client (rpc.js via axios) → Idena Node
  ↓
Cache Store (Redis, endpoint-specific TTL)
  ↓
JSON Response
```

**Key Characteristics:**
- No database required (stateless)
- Optional Redis for caching (graceful degradation if unavailable)
- Direct RPC passthrough for uncached queries
- Horizontal scaling via shared Redis
- Automatic reconnection on Redis failure (10 retry attempts)

### Middleware Pipeline (server.js)

1. **Helmet.js**: Security headers (XSS protection, content type sniffing prevention)
2. **CORS**: Cross-origin resource sharing (enabled by default)
3. **express.json()**: JSON body parsing
4. **Rate Limiter**: 100 requests/minute/IP via express-rate-limit
5. **Error Handler**: Centralized error handling with status codes

### Cache TTL Strategy (per endpoint)

- Identity: 300s (5 minutes)
- Stake: 300s (5 minutes)
- Balance: 300s (5 minutes)
- Transaction: 600s (10 minutes - transactions are immutable)
- Block: 600s (10 minutes - blocks are immutable)
- Identities list: 120s (2 minutes - more volatile)
- Epoch current: 60s (1 minute)
- Epoch intervals: 600s (10 minutes - rarely changes)

## API Endpoints

### API Documentation (Swagger)
```bash
# Interactive Swagger UI
GET /api/docs

# OpenAPI 3.0 JSON specification
GET /api/docs.json
```

### Health & Status
```bash
GET /api/health
# Response: { "status": "ok", "uptime": 12345, "timestamp": "..." }
```

### Identity Endpoints
```bash
# Get single identity
GET /api/identity/{address}

# Get identity stake
GET /api/identity/{address}/stake

# Get all identities (paginated, filterable)
GET /api/identities?limit=100&offset=0&states=Human,Verified&minStake=10000
```

### Balance Endpoint
```bash
# Get balance and stake for an address
GET /api/balance/{address}
# Response: { "address": "0x...", "balance": "1000.5", "stake": "500.25", "unit": "iDNA" }
```

### Transaction Endpoint
```bash
# Get transaction by hash
GET /api/transaction/{hash}
# Response: { "result": { "hash": "0x...", "type": "send", "from": "0x...", "to": "0x...", "amount": "100.5", ... } }
```

### Block Endpoint
```bash
# Get block by height
GET /api/block/12345

# Get block by hash
GET /api/block/{hash}
# Response: { "result": { "height": 12345, "hash": "0x...", "parentHash": "0x...", "timestamp": ..., ... } }
```

### Epoch Endpoints
```bash
# Get current epoch
GET /api/epoch/current

# Get ceremony intervals
GET /api/epoch/intervals
```

### Response Format

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "cached": true,
  "timestamp": "2026-01-13T12:00:00Z"
}
```

**Error:**
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Key Dependencies

**Core:**
- `express` ^5.2.1: Web framework
- `axios` ^1.7.9: HTTP client for JSON-RPC calls
- `redis` ^5.10.0: Caching layer

**Security & Middleware:**
- `helmet` ^8.1.0: Security headers
- `cors` ^2.8.5: CORS handling
- `express-rate-limit` ^8.2.1: Rate limiting
- `dotenv` ^17.2.3: Environment variable management

**Documentation:**
- `swagger-jsdoc` ^6.2.8: Generate OpenAPI spec from JSDoc comments
- `swagger-ui-express` ^5.0.1: Serve interactive Swagger UI

**Dev Dependencies:**
- `@eslint/js` ^9.39.2: ESLint recommended rules
- `eslint` ^9.39.2: JavaScript linter (flat config format)
- `eslint-config-prettier` ^10.1.8: Disables ESLint rules that conflict with Prettier
- `globals` ^16.3.0: Global variable definitions for ESLint
- `jest` ^30.2.0: Testing framework
- `nodemon` ^3.1.10: Hot reload for development
- `prettier` ^3.5.3: Code formatter
- `supertest` ^7.2.2: HTTP assertion library

**Node Version:** >=18.0.0

## Code Style and Conventions

- **Node Version**: 18.0.0+ (LTS)
- Use modern JavaScript (async/await, ES6+ features)
- Follow Airbnb JavaScript style guide
- Use destructuring, arrow functions, template literals
- Handle errors with try-catch in async routes
- Return consistent JSON response format
- Use appropriate HTTP status codes (200, 400, 404, 429, 500, 503)
- Never commit secrets (use .env file, add to .gitignore)

## Development Workflow

### Adding New Endpoints

1. Create route file in `src/routes/` (e.g., `blocks.js`)
2. Import `IdenaRPC` from `../rpc` and `cache` from `../cache`
3. Define Express router with async handlers
4. Add address validation (regex: `/^0x[a-fA-F0-9]{40}$/`)
5. Implement cache-first pattern: check cache → RPC call → store in cache
6. **Add Swagger JSDoc annotations** for API documentation (see existing routes for examples)
7. Register routes in `src/server.js`: `app.use('/api/blocks', blocksRoutes)`
8. Write tests in `tests/`

### Adding Swagger Documentation

Add JSDoc comments above route handlers:

```javascript
/**
 * @swagger
 * /api/blocks/{height}:
 *   get:
 *     summary: Get block by height
 *     description: Retrieves block information for a specific height
 *     tags: [Blocks]
 *     parameters:
 *       - in: path
 *         name: height
 *         required: true
 *         schema:
 *           type: integer
 *         description: Block height
 *     responses:
 *       200:
 *         description: Block found
 *       404:
 *         description: Block not found
 */
router.get('/:height', async (req, res, next) => {
  // handler code
});
```

Add new schemas to `src/swagger.js` in the `components.schemas` section if needed.

### Modifying RPC Calls

Edit `src/rpc.js`:

```javascript
// Add new method to IdenaRPC class
async getBlock(height) {
  return await this.call('dna_block', [height]);
}
```

Key RPC methods available:
- `dna_identity` - Get identity by address
- `dna_identities` - Get all identities
- `dna_epoch` - Get current epoch info
- `dna_ceremonyIntervals` - Get validation ceremony timing

### Cache Pattern

In route handlers:

```javascript
const cacheKey = cache.generateKey('prefix', ...params);
let data = await cache.get(cacheKey);
if (!data) {
  data = await rpc.someMethod();
  await cache.set(cacheKey, data, TTL_SECONDS);
}
```

### Testing Changes

```bash
# Terminal 1: Start Redis (if using caching)
docker run -d -p 6379:6379 redis:7

# Terminal 2: Run API in dev mode
npm run dev

# Terminal 3: Test endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/identity/0x...
curl http://localhost:3000/api/epoch/current

# Run automated tests
npm test
```

## Performance

**Response Times:**
- Cached: <50ms
- Uncached: <500ms (depends on RPC node)
- Rate limit: 100 requests/minute/IP
- Cache duration: 5 minutes (configurable)

**Scaling:**
- Stateless design enables horizontal scaling
- Shared Redis for cache across instances
- Use load balancer (nginx, HAProxy) for multiple instances
- Monitor with Prometheus + Grafana

## Deployment

### Option 1: Hetzner VPS (~€5/month)

```bash
# 1. Create Hetzner VPS (CPX11 or better)
# 2. SSH into server
ssh root@your-server-ip

# 3. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 4. Clone and deploy
git clone https://github.com/idena-community/idena-lite-api.git
cd idena-lite-api/idena-lite-api
cp .env.example .env
nano .env  # Configure IDENA_RPC_URL

# 5. Start with Docker Compose
docker-compose up -d

# 6. Setup nginx reverse proxy (optional)
# See deployment docs for nginx configuration
```

### Option 2: Railway.app (Free Tier)

1. Fork this repository
2. Connect Railway to your GitHub
3. Deploy with one click
4. Set environment variables in Railway dashboard
   - `IDENA_RPC_URL`
   - `PORT` (Railway provides this)

### Option 3: Fly.io (Free Tier)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly secrets set IDENA_RPC_URL=https://rpc.holismo.org
fly deploy
```

## Security

**Built-in Security:**
- ✅ Rate limiting (100 req/min per IP)
- ✅ Helmet.js security headers
- ✅ CORS enabled (configurable)
- ✅ Input validation
- ✅ No data storage (stateless)
- ✅ Error message sanitization

**Best Practices:**
- Use HTTPS in production (nginx reverse proxy)
- Never log or expose API keys
- Implement request size limits
- Monitor for abuse patterns
- Use environment variables for secrets
- Keep dependencies updated

## Monitoring

**Health Checks:**
```bash
# Health endpoint
curl http://localhost:3000/api/health

# Check Redis connection
redis-cli ping

# Check RPC connection
curl -X POST $IDENA_RPC_URL \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"dna_epoch","params":[],"id":1}'
```

**Logs:**
- Application logs to stdout (Docker captures)
- Use `docker-compose logs -f` to monitor
- Consider log aggregation (ELK, Loki, etc.)

**Metrics:**
- Response times per endpoint
- Cache hit/miss rates
- Rate limit rejections
- RPC error rates

## Common Issues

**RPC Connection Errors:**
- Verify `IDENA_RPC_URL` is correct
- Check Idena node is running and accessible
- Test RPC endpoint with curl
- Verify firewall/network settings

**Redis Connection Errors:**
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` is correct
- Consider disabling Redis: `REDIS_ENABLED=false`

**Rate Limit Too Restrictive:**
- Adjust `RATE_LIMIT_MAX_REQUESTS` in .env
- Increase `RATE_LIMIT_WINDOW_MS`
- Consider per-endpoint rate limits

**High Memory Usage:**
- Reduce `CACHE_TTL`
- Limit Redis memory: `maxmemory 256mb` in redis.conf
- Monitor with `docker stats`

## Comparison with idena-indexer-api

**Use idena-lite-api when:**
- Need real-time data only (current state)
- Want simple deployment without database
- Building lightweight apps or prototypes
- Don't want to sync 100+ hours of blockchain data

**Use idena-indexer-api when:**
- Need historical data queries (past epochs, transaction history)
- Require complex filtering and search
- Building data analytics or explorer applications
- Need high-performance queries with database caching

**Key Differences:**
| Feature | idena-lite-api | idena-indexer-api |
|---------|----------------|-------------------|
| Database | None | PostgreSQL required |
| Deployment | Minutes | Hours (sync time) |
| Historical Data | No | Yes |
| Search | Limited | Full-text |
| Setup Complexity | Low | High |
| Resource Requirements | Minimal | Significant |

## Community Resources

**Public Instances:**
- `https://api1.idena.community` (EU)
- `https://api2.idena.community` (US)
- `https://api3.idena.community` (Asia)

**Want to add yours?** Open a PR!

**Community:**
- Discord: Idena Network server
- GitHub Issues: Report bugs or request features
- Community RPC nodes: https://rpc.holismo.org/, https://rpc.idio.network/

## Contributing

We welcome contributions!

1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Test thoroughly (npm test, manual testing)
5. Submit a pull request with clear description

See the main repository CLAUDE.md (`../../../CLAUDE.md`) for full ecosystem overview and cross-project patterns.

---

**Status:** Alpha (active development)
**Version:** 0.1.0-alpha
**Maintainer:** Idena Community
