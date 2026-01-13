# idena-lite-api

**Community-maintained lightweight API for the Idena blockchain**

A fast, reliable, and easy-to-deploy alternative to `api.idena.io` built by the Idena community.

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

### Epoch Endpoints
```bash
# Get current epoch
GET /api/epoch/current

# Get ceremony intervals
GET /api/epoch/intervals
```

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

# Start in development mode
npm run dev
```

### Testing

```bash
npm test
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

Public instances maintained by the community:

- `https://api1.idena.community` (EU)
- `https://api2.idena.community` (US)
- `https://api3.idena.community` (Asia)

**Want to add yours?** Open a PR!

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

**⚡ Status**: Production Ready  
**🔄 Version**: 1.0.0  
**👥 Maintainer**: Idena Community
