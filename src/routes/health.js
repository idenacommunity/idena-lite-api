const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Get API health status
 *     description: Returns the health status of the API, Idena RPC node, and cache
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is healthy and RPC node is connected
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       503:
 *         description: API is operational but RPC node is unavailable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
router.get('/health', async (req, res) => {
  try {
    const nodeHealth = await rpc.getNodeHealth();
    const cacheHealth = cache.enabled ? 'connected' : 'disabled';

    const health = {
      api: {
        status: 'operational',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      idenaNode: nodeHealth,
      cache: {
        status: cacheHealth,
        enabled: cache.enabled,
      },
    };

    const statusCode = nodeHealth.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      api: {
        status: 'error',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      },
      error: error.message,
    });
  }
});

/**
 * @swagger
 * /api/ping:
 *   get:
 *     summary: Ping the API
 *     description: Simple ping endpoint to check if the API is responding
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is responding
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pong:
 *                   type: boolean
 *                   example: true
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/ping', (req, res) => {
  res.json({
    pong: true,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
