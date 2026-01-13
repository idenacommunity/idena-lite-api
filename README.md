# idena-lite-api

[![CI](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml/badge.svg)](https://github.com/idenacommunity/idena-lite-api/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com)
[![Development Status](https://img.shields.io/badge/Status-Alpha-orange)](https://github.com/idenacommunity/idena-lite-api)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/idenacommunity/idena-lite-api?style=social)](https://github.com/idenacommunity/idena-lite-api/network/members)

**Community-maintained lightweight API for the Idena blockchain**

A lightweight alternative to `api.idena.io` built by the Idena community.

---

## ⚠️ Development Status

**IMPORTANT: This project is in alpha stage and NOT yet tested in production.**

- ❌ **Not production-ready** - Under active development
- ⚠️ **Limited testing** - Basic functionality not fully tested
- 🔄 **Alpha stage** - API endpoints may change
- 🧪 **Needs testing** - Test suite in development
- 📝 **Incomplete docs** - Some endpoints not documented

**Use at your own risk. Do not rely on this for critical applications yet.**

### What Works
- ✅ Basic Express server setup
- ✅ Docker configuration
- ✅ RPC client structure

### What Needs Work
- ⚠️ API endpoint implementation
- ⚠️ Redis caching integration
- ⚠️ Comprehensive testing
- ⚠️ Error handling
- ⚠️ Production deployment validation

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
- Access to an Idena RPC node (your own or community node)

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

### Using Community RPC Nodes

Don't want to run your own node? Use community nodes:

```env
# Option 1
IDENA_RPC_URL=https://rpc.idio.network

# Option 2
IDENA_RPC_URL=https://rpc.holismo.org
```

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
└── health.test.js      # Health endpoint integration tests
```

**What's tested:**
- ✅ Express server initialization
- ✅ Security headers (Helmet)
- ✅ Rate limiting
- ✅ RPC client methods
- ✅ Health endpoints
- ✅ Error handling
- ✅ 404 responses

**Before deploying:**
```bash
# 1. Run tests
npm test

# 2. Check coverage (aim for >80%)
npm run test:coverage

# 3. Test with real Idena node
# Edit .env to point to a test node
IDENA_RPC_URL=https://rpc.idio.network npm test
```

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

**⚡ Status**: Alpha - NOT Production Ready
**🔄 Version**: 0.1.0-alpha
**👥 Maintainer**: Idena Community
**⚠️ Warning**: Experimental software - Needs testing before production use
