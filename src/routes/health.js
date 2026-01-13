const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

// GET /api/health
router.get('/health', async (req, res) => {
  try {
    const nodeHealth = await rpc.getNodeHealth();
    const cacheHealth = cache.enabled ? 'connected' : 'disabled';

    const health = {
      api: {
        status: 'operational',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      idenaNode: nodeHealth,
      cache: {
        status: cacheHealth,
        enabled: cache.enabled
      }
    };

    const statusCode = nodeHealth.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      api: {
        status: 'error',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      },
      error: error.message
    });
  }
});

// GET /api/ping
router.get('/ping', (req, res) => {
  res.json({ 
    pong: true,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
