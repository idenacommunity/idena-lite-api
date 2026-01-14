const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config({ quiet: true });

const identityRoutes = require('./routes/identity');
const epochRoutes = require('./routes/epoch');
const healthRoutes = require('./routes/health');
const balanceRoutes = require('./routes/balance');
const transactionRoutes = require('./routes/transaction');
const blockRoutes = require('./routes/block');
const historyRoutes = require('./routes/history');
const addressRoutes = require('./routes/address');
const statsRoutes = require('./routes/stats');
const syncService = require('./sync');

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

// Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Routes
app.use('/api', healthRoutes);
app.use('/api/identity', identityRoutes);
app.use('/api/epoch', epochRoutes);
app.use('/api/epochs', epochRoutes); // Mount epochs router at /api/epochs for list endpoint
app.use('/api/balance', balanceRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/block', blockRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/address', addressRoutes);
app.use('/api/stats', statsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'idena-lite-api',
    version: '0.2.0-beta',
    description: 'Current-state API for Idena with optional historical queries',
    endpoints: {
      // Current state (real-time)
      health: '/api/health',
      identity: '/api/identity/:address',
      identities: '/api/identity?limit=100&offset=0',
      balance: '/api/balance/:address',
      transaction: '/api/transaction/:hash',
      block: '/api/block/:heightOrHash',
      epoch: '/api/epoch/current',
      stake: '/api/identity/:address/stake',
      // Historical (requires HISTORY_ENABLED=true)
      historyStatus: '/api/history/status',
      addressTransactions: '/api/history/address/:address/transactions',
      historicalBlock: '/api/history/block/:height',
      historicalTransaction: '/api/history/transaction/:hash',
      // Documentation
      docs: '/api/docs',
    },
    features: {
      currentState: true,
      historicalQueries: process.env.HISTORY_ENABLED !== 'false',
    },
    documentation: 'https://github.com/idenacommunity/idena-lite-api',
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

    // Start historical sync if enabled
    if (process.env.HISTORY_ENABLED !== 'false') {
      console.log(`📚 Historical sync: enabled`);
      syncService.start();
    } else {
      console.log(`📚 Historical sync: disabled (set HISTORY_ENABLED=true to enable)`);
    }
  });
}

module.exports = app;
