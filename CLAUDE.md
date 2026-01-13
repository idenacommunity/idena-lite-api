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
- **Status**: Production ready, ongoing development
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
├── server.js                    # Express server entry point
├── routes/                      # API route handlers
│   ├── identity.js              # Identity endpoints
│   ├── epoch.js                 # Epoch endpoints
│   └── health.js                # Health check
├── services/
│   ├── rpc.js                   # Idena RPC client wrapper
│   └── cache.js                 # Redis caching layer
├── middleware/                  # Express middleware
│   ├── rateLimit.js             # Rate limiting
│   ├── cors.js                  # CORS configuration
│   └── errorHandler.js          # Error handling
└── utils/                       # Helper functions
    └── logger.js                # Logging utilities
```

## Common Commands

### Setup & Running
```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit configuration (set IDENA_RPC_URL)
nano .env

# Run in development mode (with hot reload)
npm run dev

# Run in production mode
npm start

# Run tests
npm test
```

### Docker
```bash
# Build Docker image
npm run docker:build
# or
docker build -t idena-lite-api:latest .

# Run with Docker Compose
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

### Development
```bash
# Install dev dependencies
npm install --dev

# Run linter
npm run lint

# Format code
npm run format

# Watch mode (auto-restart on changes)
npm run dev
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
Cache Check (Redis)
  ↓ (cache miss)
RPC Client (axios) → Idena Node
  ↓
Cache Store (Redis, TTL: 5min)
  ↓
JSON Response
```

**Key Characteristics:**
- No database required (stateless)
- Optional Redis for caching (works without it)
- Direct RPC passthrough for uncached queries
- Horizontal scaling via shared Redis
- Self-healing (restarts RPC connection on failure)

### Middleware Pipeline

1. **Helmet.js**: Security headers (XSS, CSP, etc.)
2. **CORS**: Cross-origin resource sharing
3. **Rate Limiter**: 100 requests/minute/IP (configurable)
4. **Request Logger**: Structured logging with Winston
5. **Error Handler**: Centralized error handling and formatting

## API Endpoints

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
- `express` ^4.18.2: Web framework
- `axios` ^1.6.0: HTTP client for RPC calls
- `redis` ^4.6.11: Caching layer

**Middleware:**
- `helmet` ^7.1.0: Security headers
- `cors` ^2.8.5: CORS handling
- `express-rate-limit` ^7.1.5: Rate limiting
- `dotenv` ^16.3.1: Environment variable management

**Utilities:**
- `winston`: Logging (optional)
- `joi`: Request validation (optional)

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
2. Define Express routes with middleware
3. Implement RPC calls via `rpc.js` service
4. Add caching logic via `cache.js` service
5. Register routes in `src/server.js`
6. Test endpoint with curl or Postman
7. Update documentation

### Modifying RPC Calls

1. Edit `src/services/rpc.js`
2. Add new RPC method wrapper
3. Handle errors and timeouts
4. Return normalized data format
5. Test with actual Idena node

### Adjusting Cache Strategy

In `src/services/cache.js`:

```javascript
// Per-endpoint TTL
const CACHE_TTLS = {
  'identity': 300,      // 5 minutes
  'epoch': 60,          // 1 minute
  'balance': 120,       // 2 minutes
};
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

# Check rate limiting
for i in {1..150}; do curl http://localhost:3000/api/health; done
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

**Status:** Production Ready
**Version:** 1.0.0
**Maintainer:** Idena Community
