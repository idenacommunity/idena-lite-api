# idena-lite-api

[![CI](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml/badge.svg)](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/Coverage-97%25-brightgreen?logo=jest&logoColor=white)](https://github.com/idenacommunity/idena-lite-api)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com)
[![Development Status](https://img.shields.io/badge/Status-Beta-blue)](https://github.com/idenacommunity/idena-lite-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/network/members)

**Community-maintained lightweight API for the Idena blockchain**

A fast API for Idena with **real-time queries** and **optional historical data sync**.

> **Two modes:**
> - **Default**: Real-time queries only (instant deployment, no sync needed)
> - **With history**: Enable `HISTORY_ENABLED=true` to sync transaction history to local SQLite

---

## 🚦 Development Status

**This project is in beta stage - feature complete with comprehensive testing.**

- ✅ **97% test coverage** - 438 tests across 16 test suites
- ✅ **API complete** - 40+ endpoints implemented and documented
- ✅ **Error handling** - Comprehensive error responses
- 🔄 **Beta stage** - Ready for community testing
- ⚠️ **Needs production validation** - Not yet battle-tested at scale

**Ready for testing and feedback. Report issues on GitHub.**

### What Works
- ✅ Express server with security middleware
- ✅ Real-time endpoints (identity, balance, transaction, block, epoch)
- ✅ Historical endpoints with SQLite sync (transaction history)
- ✅ **Epoch & identity state tracking** - Historical identity states per epoch
- ✅ **Rewards & validation data** - Ceremony results, rewards by type
- ✅ **Balance change tracking** - Full balance history (tx_in, tx_out, rewards, penalties)
- ✅ **Invite tracking** - Sent/received invites, activation status
- ✅ **Network statistics** - Online count, coin supply, identity breakdown
- ✅ Redis caching with graceful degradation
- ✅ RPC client with error handling
- ✅ Docker deployment
- ✅ Swagger API documentation
- ✅ Comprehensive test suite (438 tests)

### What Needs Work
- ⚠️ Production deployment validation
- ⚠️ Load testing at scale
- ⚠️ Community instance deployment

---

## 🎯 Purpose

A **lightweight API** for Idena with two operation modes:

### Mode 1: Real-time Only (Default)
- ✅ Identity verification (login gates, access control)
- ✅ Current balance/stake checks
- ✅ Epoch and validation ceremony info
- ✅ Deploys in minutes (no sync needed)
- ✅ Stateless - no database required

### Mode 2: With Historical Sync (`HISTORY_ENABLED=true`)
- ✅ Everything from Mode 1, plus:
- ✅ Transaction history per address
- ✅ Block/transaction lookup from local database
- ✅ **Historical identity states** - Track state changes per epoch
- ✅ **Epoch data** - Rewards, validation results, ceremony stats
- ✅ **Balance tracking** - Full balance change history
- ✅ **Invite tracking** - Sent/received invites with status
- ✅ **Network stats** - Online identities, coin supply
- ✅ Background sync to SQLite (~2-4 hours initial sync)
- ✅ Parallel fetching (~12,000 blocks/min)

## 📊 Feature Comparison

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
| Penalty tracking | ❌ | ✅ | ✅ |
| Full-text search | ❌ | ❌ | ✅ |
| Smart contract queries | ❌ | ❌ | ✅ |
| Flip content | ❌ | ❌ | ✅ |
| **Deployment time** | Minutes | 2-4 hours | 100+ hours |
| **Database** | None | SQLite (~10GB) | PostgreSQL (~100GB) |
| **Sync speed** | N/A | ~12,000 blocks/min | ~1,000 blocks/min |
| **Response time** | ~25ms | ~25ms | ~190ms |

## ⚠️ Limitations

**idena-lite-api CANNOT provide:**

- ❌ **Full-text search** - Search across addresses, transactions, etc.
- ❌ **Smart contract data** - Contract state, calls, deployments
- ❌ **Flip content** - IPFS flip images and answers
- ❌ **Complex analytics** - Advanced aggregations and trends

**Need these features?** Use [idena-indexer-api](https://github.com/idena-network/idena-indexer-api) (requires PostgreSQL, 100+ hours sync).

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Access to an Idena RPC node (see [RPC Node Requirements](#rpc-node-requirements))

### Deploy in 5 minutes

```bash
# 1. Clone the repository
git clone https://github.com/idena-community/idena-lite-api.git
cd idena-lite-api

# 2. Configure environment
cp .env.example .env
# Edit .env to set your IDENA_RPC_URL

# 3. Start the API
docker-compose up -d

# 4. Test it
curl http://localhost:3000/api/health
```

**That's it!** Your API is now running on `http://localhost:3000`

## 📡 API Endpoints

### Health Check
```bash
GET /api/health
```

### Identity Endpoints
```bash
# Get single identity
GET /api/identity/0x1234...

# Get identity stake
GET /api/identity/0x1234.../stake

# Get all identities (paginated, filterable)
GET /api/identities?limit=100&offset=0&states=Human,Verified&minStake=10000
```

### Balance Endpoint
```bash
# Get balance and stake for an address
GET /api/balance/0x1234...

# Response: { "address": "0x...", "balance": "1000.5", "stake": "500.25", "unit": "iDNA" }
```

### Transaction Endpoint
```bash
# Get transaction by hash
GET /api/transaction/0x1234567890abcdef...

# Response: { "result": { "hash": "0x...", "type": "send", "from": "0x...", "to": "0x...", "amount": "100.5", ... } }
```

### Block Endpoint
```bash
# Get block by height
GET /api/block/12345

# Get block by hash
GET /api/block/0x1234567890abcdef...

# Response: { "result": { "height": 12345, "hash": "0x...", "parentHash": "0x...", "timestamp": ..., ... } }
```

### Epoch Endpoints
```bash
# Get current epoch
GET /api/epoch/current

# Get ceremony intervals
GET /api/epoch/intervals
```

### Historical Endpoints (requires `HISTORY_ENABLED=true`)

#### Sync & Status
```bash
# Get sync status
GET /api/history/status
# Response: { "enabled": true, "running": true, "lastSyncedBlock": 5000000, "progress": "45.2%", "database": {...} }
```

#### Transaction History
```bash
# Get transaction history for an address
GET /api/history/address/0x1234.../transactions?limit=50&offset=0
# Response: { "data": [...], "total": 150, "hasMore": true }

# Get historical block from local database
GET /api/history/block/5000000

# Get historical transaction from local database
GET /api/history/transaction/0xabcd...
```

#### Epoch Endpoints
```bash
# Get specific epoch details
GET /api/epoch/:epoch

# List epochs (paginated)
GET /api/epochs?limit=10&offset=0

# Get identities for an epoch
GET /api/epoch/:epoch/identities

# Get epoch rewards summary
GET /api/epoch/:epoch/rewards

# Get epoch penalties
GET /api/epoch/:epoch/penalties
GET /api/epoch/:epoch/penalties/summary

# Get epoch invites
GET /api/epoch/:epoch/invites
GET /api/epoch/:epoch/invites/summary
```

#### Identity State History
```bash
# Get identity state history across epochs
GET /api/history/identity/0x1234.../epochs

# Get identity state at specific epoch
GET /api/history/identity/0x1234.../state/:epoch

# Get identity rewards history
GET /api/history/identity/0x1234.../rewards
GET /api/history/identity/0x1234.../rewards/:epoch

# Get identity validation history
GET /api/history/identity/0x1234.../validation
GET /api/history/identity/0x1234.../validation/:epoch

# Get identity invite history
GET /api/history/identity/0x1234.../invites?type=sent|received&status=pending|activated
```

#### Address Endpoints
```bash
# Get full address info (balance, stake, identity state, tx counts)
GET /api/address/0x1234...

# Get balance change history
GET /api/address/0x1234.../balance/changes?type=tx_in|tx_out|reward|penalty

# Get address penalties
GET /api/address/0x1234.../penalties?epoch=150

# Get address state history across epochs
GET /api/history/address/0x1234.../states
GET /api/history/address/0x1234.../state/:epoch
```

#### Network Statistics
```bash
# Get online identities count
GET /api/stats/online

# Get coin supply statistics
GET /api/stats/coins

# Get identity breakdown by state
GET /api/stats/identities

# Get network summary
GET /api/stats/summary

# Get epoch statistics (invites, penalties, etc.)
GET /api/stats/epoch/:epoch
```

#### Invite Lookup
```bash
# Get invite by hash
GET /api/history/invite/:hash
```

## 📖 API Documentation

Interactive API documentation is available via Swagger UI:

```bash
# Swagger UI (interactive documentation)
GET /api/docs

# OpenAPI JSON specification
GET /api/docs.json
```

**Features:**
- Interactive endpoint testing
- Request/response schemas
- Parameter descriptions
- Error response documentation

Access the documentation at `http://localhost:3000/api/docs` when running locally.

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `3000` |
| `IDENA_RPC_URL` | Idena node RPC endpoint | `http://localhost:9009` |
| `IDENA_API_KEY` | Optional API key for your node | - |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_PASSWORD` | Redis password (if not in URL) | - |
| `REDIS_ENABLED` | Enable/disable caching | `true` |
| `CACHE_TTL` | Cache duration in seconds | `300` (5 min) |
| `HISTORY_ENABLED` | Enable historical sync to SQLite | `true` |
| `SQLITE_PATH` | Path to SQLite database file | `./data/history.db` |
| `SYNC_BATCH_SIZE` | Blocks per sync batch | `500` |
| `SYNC_INTERVAL` | Milliseconds between batches | `1000` |
| `SYNC_CONCURRENCY` | Parallel RPC requests | `20` |

### Sync Performance Tuning

The historical sync uses parallel fetching for optimal performance:

| Setting | Conservative | Default | Aggressive |
|---------|-------------|---------|------------|
| `SYNC_BATCH_SIZE` | 100 | 500 | 1000 |
| `SYNC_INTERVAL` | 5000 | 1000 | 500 |
| `SYNC_CONCURRENCY` | 5 | 20 | 50 |

**Tuning tips:**
- **Slow RPC/limited resources**: Use conservative settings
- **Fast local node**: Use aggressive settings
- **Monitor logs**: Watch for RPC timeout errors and adjust accordingly
- **Initial sync**: Higher concurrency speeds up catch-up significantly

### RPC Node Requirements

⚠️ **Important:** This API requires access to an Idena RPC node that accepts JSON-RPC POST requests.

**Option 1: Run Your Own Node (Recommended)**

Running your own node provides:
- Full control and reliability
- No rate limiting or Cloudflare blocks
- Access to all RPC methods

See [Idena Node Setup Guide](#-idena-node-setup-guide) below for detailed instructions.

**Option 2: Private RPC Access**

If you have API key access to a private Idena RPC endpoint:

```env
IDENA_RPC_URL=https://your-private-rpc.example.com
IDENA_API_KEY=your-api-key
```

**⚠️ Public Community Nodes May Not Work**

Public community RPC nodes (e.g., `rpc.holismo.org`, `rpc.idio.network`) often have Cloudflare protection that blocks direct JSON-RPC POST requests, returning 405 errors. These nodes may require:
- Special authentication headers
- API key access
- Specific client configurations

If you encounter 405 errors, you'll need to run your own node or obtain private RPC access.

## 🖥️ Idena Node Setup Guide

### Prerequisites

- **Disk space:** 50-100GB free
- **Memory:** 4GB+ RAM recommended
- **Docker:** Installed and running

### Quick Setup (Docker)

```bash
# 1. Create node directory
mkdir -p ~/idena-node/datadir
cd ~/idena-node

# 2. Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
services:
  idena-node:
    image: rinzlerfr/idena-node:latest
    container_name: idena-node
    restart: unless-stopped
    ports:
      - "9009:9009"   # RPC port
      - "40405:40405" # P2P port
    volumes:
      - ./datadir:/datadir
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
EOF

# 3. Start the node
docker compose up -d

# 4. Wait for initialization (2-5 minutes for first start)
docker logs -f idena-node
```

### Enable External RPC Access

After the node starts, update the config to allow external RPC connections:

```bash
# Update config inside container
docker exec idena-node bash -c 'cat > /datadir/config.json << EOF
{
  "IpfsConf": {
    "Profile": "server"
  },
  "RPC": {
    "HTTPHost": "0.0.0.0",
    "HTTPPort": 9009
  }
}
EOF'

# Restart to apply config
docker compose restart
```

### Get API Key

The node generates an API key on first start:

```bash
# Get your API key
docker exec idena-node cat /datadir/api.key
```

Save this key - you'll need it for the `.env` file.

### Configure idena-lite-api

```bash
# In your idena-lite-api directory
cat > .env << EOF
PORT=3000
IDENA_RPC_URL=http://localhost:9009
IDENA_API_KEY=your-api-key-here
REDIS_URL=redis://localhost:6379
REDIS_ENABLED=true
CACHE_TTL=300
EOF
```

### Sync Time Estimates

| Sync Type | Time | Notes |
|-----------|------|-------|
| Fast sync (snapshot) | 6-12 hours | Default mode |
| Full sync | 100+ hours | Complete verification |

The node uses fast sync by default, starting from a snapshot at ~50% blockchain height.

### Monitor Sync Progress

```bash
# Check current sync status
docker exec idena-node curl -s http://localhost:9009 \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"bcn_syncing","params":[],"id":1,"key":"YOUR_API_KEY"}'

# Watch sync logs
docker logs -f idena-node | grep -i "sync\|block"

# Check current epoch
docker exec idena-node curl -s http://localhost:9009 \
  -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"dna_epoch","params":[],"id":1,"key":"YOUR_API_KEY"}'
```

### Blockchain Statistics (January 2026)

| Metric | Value |
|--------|-------|
| Current block height | ~10.2M |
| Current epoch | ~180 |
| Sync speed | ~100-500 blocks/sec |

### Troubleshooting

**Node won't start:**
```bash
# Check logs for errors
docker logs idena-node --tail 50

# Restart with fresh data (warning: re-syncs from scratch)
docker compose down
rm -rf datadir/*
docker compose up -d
```

**RPC connection refused:**
```bash
# Verify node is running
docker ps | grep idena

# Check RPC is listening
docker exec idena-node netstat -tlnp | grep 9009
```

**API key invalid:**
```bash
# Regenerate by deleting and restarting
docker exec idena-node rm /datadir/api.key
docker compose restart
docker exec idena-node cat /datadir/api.key
```

### Alternative Docker Images

| Image | Description |
|-------|-------------|
| `rinzlerfr/idena-node` | Full-featured, auto-updates |
| `idenadev/idena` | Official image with PM2 |
| `cloudpodznet/idena-docker` | Minimal VPS setup |

Sources: [xludx/docker-idena](https://github.com/xludx/docker-idena), [Rinzler78/docker.idena-node](https://github.com/Rinzler78/docker.idena-node)

## 🏗️ Production Deployment

### Option 1: Hetzner VPS (Recommended)

**Cost: ~€5/month**

```bash
# 1. Create Hetzner VPS (CPX11 or better)
# 2. SSH into server
ssh root@your-server-ip

# 3. Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# 4. Clone and deploy
git clone https://github.com/idena-community/idena-lite-api.git
cd idena-lite-api
cp .env.example .env
nano .env  # Configure your RPC URL
docker-compose up -d

# 5. Setup nginx reverse proxy (optional)
# See docs/nginx.md
```

### Option 2: Railway.app (Free Tier)

1. Fork this repository
2. Connect Railway to your GitHub
3. Deploy with one click
4. Set environment variables in Railway dashboard

### Option 3: Fly.io (Free Tier)

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Deploy
fly launch
fly deploy
```

## 🔒 Security

- ✅ Rate limiting (100 req/min per IP)
- ✅ Helmet.js security headers
- ✅ CORS enabled
- ✅ Input validation
- ✅ No data storage (stateless)

## 📊 Performance

- **Response time**: <50ms (cached)
- **RPC fallback**: <500ms (uncached)
- **Rate limit**: 100 requests/minute/IP
- **Cache duration**: 5 minutes (configurable)

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start in development mode (with auto-reload)
npm run dev

# Start in production mode
npm start
```

### Testing

The project includes a comprehensive test suite using Jest and Supertest.

**Run tests:**
```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

**Test structure:**
```
tests/
├── server.test.js      # Server setup and middleware tests
├── rpc.test.js         # RPC client unit tests
├── cache.test.js       # Redis cache unit tests
├── health.test.js      # Health endpoint tests
├── identity.test.js    # Identity endpoint tests
├── balance.test.js     # Balance endpoint tests
├── transaction.test.js # Transaction endpoint tests
├── block.test.js       # Block endpoint tests
├── epoch.test.js       # Epoch endpoint tests (+ historical epochs)
├── history.test.js     # Historical data endpoint tests
├── address.test.js     # Address endpoint tests
├── stats.test.js       # Network statistics endpoint tests
├── db.test.js          # SQLite database unit tests
├── sync.test.js        # Background sync service tests
├── rateLimit.test.js   # Rate limiting tests
└── integration.test.js # End-to-end API tests
```

**What's tested:**
- ✅ Express server initialization
- ✅ Security headers (Helmet)
- ✅ Rate limiting
- ✅ RPC client methods
- ✅ All API endpoints
- ✅ Cache operations
- ✅ Error handling
- ✅ Input validation

### Testing Strategy

The API uses a multi-stage testing approach:

```
Development:     npm test (mocked RPC)
                    ↓
Local testing:   Own node (Docker) + npm run dev
                    ↓
Staging:         Private RPC or test node
                    ↓
Production:      Own node (recommended)
```

**Stage 1: Automated Tests (CI/CD)**
- Tests use mocked RPC responses via Jest
- No real Idena node required
- Runs in GitHub Actions on every push
- Validates all endpoints, error handling, caching logic

```bash
npm test                  # Run all tests
npm run test:coverage     # With coverage report
```

**Stage 2: Local Integration Testing**
- Run your own Idena node via Docker
- Test with real blockchain data
- Verify caching and performance

```bash
# Terminal 1: Start Idena node
docker run -d -p 9009:9009 idena/idena-go

# Terminal 2: Start API
IDENA_RPC_URL=http://localhost:9009 npm run dev

# Terminal 3: Test endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/epoch/current
```

**Stage 3: Staging/Production**
- Deploy to staging environment
- Test with production-like load
- Monitor performance and errors

### RPC Options Comparison

| Aspect | Own Node (Option 1) | Private RPC (Option 2) |
|--------|---------------------|------------------------|
| **Setup** | `docker run idena/idena-go` | Get API key from provider |
| **Cost** | VPS (~€5-20/month) + storage | Usually free or paid tier |
| **Sync time** | Hours to days | Instant |
| **Reliability** | You control it | Provider-dependent |
| **Rate limits** | None | Provider-dependent |
| **Maintenance** | You update/monitor | Provider handles it |
| **Privacy** | Queries stay local | Provider sees queries |

**Recommendation:**
- **Development/Testing**: Own node via Docker (full control)
- **Quick prototyping**: Private RPC if available
- **Production**: Own node (reliability + no dependencies)

### Building Docker Image

```bash
docker build -t idena-lite-api:latest .
```

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📚 Documentation

- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## 🌐 Community Instances

**No public instances available yet.**

This project is still in alpha development. Once tested and stable, community members can deploy public instances.

**Want to be the first?** Test the API and open a PR to add your instance!

## 💬 Support

- Discord: [Idena Community](https://discord.gg/idena)
- GitHub Issues: [Report a bug](https://github.com/idena-community/idena-lite-api/issues)

## 📄 License

MIT License - see [LICENSE](LICENSE) for details

## 🙏 Acknowledgments

Built by the Idena community to keep the ecosystem decentralized and resilient.

Special thanks to:
- Original Idena core team for the blockchain
- Community RPC node operators
- All contributors

---

**⚡ Status**: Beta - Ready for Community Testing
**🔄 Version**: 0.2.0-beta
**👥 Maintainer**: Idena Community
**✅ Test Coverage**: 97% (438 tests across 16 suites)
