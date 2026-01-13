# idena-lite-api

[![CI](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml/badge.svg)](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/Coverage-100%25-brightgreen?logo=jest&logoColor=white)](https://github.com/idenacommunity/idena-lite-api)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com)
[![Development Status](https://img.shields.io/badge/Status-Beta-blue)](https://github.com/idenacommunity/idena-lite-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/network/members)

**Community-maintained lightweight API for the Idena blockchain**

A lightweight alternative to `api.idena.io` built by the Idena community.

---

## 🚦 Development Status

**This project is in beta stage - feature complete with comprehensive testing.**

- ✅ **100% test coverage** - All code paths tested
- ✅ **API complete** - All endpoints implemented and documented
- ✅ **Error handling** - Comprehensive error responses
- 🔄 **Beta stage** - Ready for community testing
- ⚠️ **Needs production validation** - Not yet battle-tested at scale

**Ready for testing and feedback. Report issues on GitHub.**

### What Works
- ✅ Express server with security middleware
- ✅ All API endpoints (identity, balance, transaction, block, epoch)
- ✅ Redis caching with graceful degradation
- ✅ RPC client with error handling
- ✅ Docker deployment
- ✅ Swagger API documentation
- ✅ Comprehensive test suite (100% coverage)

### What Needs Work
- ⚠️ Production deployment validation
- ⚠️ Load testing at scale
- ⚠️ Community instance deployment

---

## 🎯 Purpose

Replace the centralized `api.idena.io` with decentralized, community-owned infrastructure that:
- ✅ Provides fast, cached responses
- ✅ Works with any Idena RPC node
- ✅ Deploys in minutes with Docker
- ✅ Scales horizontally
- ✅ Has minimal dependencies

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
| `REDIS_ENABLED` | Enable/disable caching | `true` |
| `CACHE_TTL` | Cache duration in seconds | `300` (5 min) |

### RPC Node Requirements

⚠️ **Important:** This API requires access to an Idena RPC node that accepts JSON-RPC POST requests.

**Option 1: Run Your Own Node (Recommended)**

```bash
# Using Docker
docker run -d -p 9009:9009 idena/idena-go

# Then configure
IDENA_RPC_URL=http://localhost:9009
```

Running your own node provides:
- Full control and reliability
- No rate limiting or Cloudflare blocks
- Access to all RPC methods

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
├── epoch.test.js       # Epoch endpoint tests
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
**🔄 Version**: 0.1.0-beta
**👥 Maintainer**: Idena Community
**✅ Test Coverage**: 100% (statements, branches, functions, lines)
