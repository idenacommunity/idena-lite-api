const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const identityRoutes = require('./routes/identity');
const epochRoutes = require('./routes/epoch');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting: 100 requests per minute per IP
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Routes
app.use('/api', healthRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/epoch', epochRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'idena-lite-api',
    version: '1.0.0',
    description: 'Community-maintained Idena API',
    endpoints: {
      health: '/api/health',
      identity: '/api/identity/:address',
      identities: '/api/identities?limit=100&offset=0',
      epoch: '/api/epoch/current',
      stake: '/api/identity/:address/stake',
    },
    documentation: 'https://github.com/idena-community/idena-lite-api',
    rpcNode: process.env.IDENA_RPC_URL || 'Not configured',
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.status || 500,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      message: 'Endpoint not found',
      status: 404,
    },
  });
});

// Only start server if this file is run directly (not imported for tests)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 idena-lite-api running on port ${PORT}`);
    console.log(`📡 Connected to RPC: ${process.env.IDENA_RPC_URL || 'http://localhost:9009'}`);
    console.log(`💾 Redis: ${process.env.REDIS_URL || 'localhost:6379'}`);
  });
}

module.exports = app;
