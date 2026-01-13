const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/identity/{address}:
 *   get:
 *     summary: Get identity by address
 *     description: Retrieves identity information for a specific Idena address
 *     tags: [Identity]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address (0x followed by 40 hex characters)
 *         example: '0x1234567890abcdef1234567890abcdef12345678'
 *     responses:
 *       200:
 *         description: Identity found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   $ref: '#/components/schemas/Identity'
 *                 cached:
 *                   type: boolean
 *       400:
 *         description: Invalid address format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Identity not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: {
          message: 'Invalid Idena address format',
          status: 400,
        },
      });
    }

    const cacheKey = cache.generateKey('identity', address.toLowerCase());

    // Check cache
    let identity = await cache.get(cacheKey);

    if (!identity) {
      // Fetch from RPC
      identity = await rpc.getIdentity(address);

      if (!identity) {
        return res.status(404).json({
          error: {
            message: 'Identity not found',
            status: 404,
          },
        });
      }

      // Cache for 5 minutes
      await cache.set(cacheKey, identity, 300);
    }

    res.json({
      result: identity,
      cached: !!identity.cached,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/identity/{address}/stake:
 *   get:
 *     summary: Get identity stake
 *     description: Retrieves the stake amount for a specific Idena address
 *     tags: [Identity]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *         example: '0x1234567890abcdef1234567890abcdef12345678'
 *     responses:
 *       200:
 *         description: Stake information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   description: Idena address
 *                 stake:
 *                   type: string
 *                   description: Stake amount
 *                   example: '1000.5'
 *                 unit:
 *                   type: string
 *                   example: 'iDNA'
 *       400:
 *         description: Invalid address format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Identity not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:address/stake', async (req, res, next) => {
  try {
    const { address } = req.params;

    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: {
          message: 'Invalid Idena address format',
          status: 400,
        },
      });
    }

    const cacheKey = cache.generateKey('stake', address.toLowerCase());

    let stake = await cache.get(cacheKey);

    if (stake === null) {
      const identity = await rpc.getIdentity(address);

      if (!identity) {
        return res.status(404).json({
          error: {
            message: 'Identity not found',
            status: 404,
          },
        });
      }

      stake = identity.stake || '0';
      await cache.set(cacheKey, stake, 300);
    }

    res.json({
      address,
      stake,
      unit: 'iDNA',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/identity:
 *   get:
 *     summary: Get all identities
 *     description: Retrieves a paginated list of identities with optional filtering
 *     tags: [Identity]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 1000
 *           default: 100
 *         description: Number of results per page (max 1000)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Offset from the beginning
 *       - in: query
 *         name: states
 *         schema:
 *           type: string
 *         description: Comma-separated list of identity states to filter
 *         example: 'Human,Verified'
 *       - in: query
 *         name: minStake
 *         schema:
 *           type: number
 *         description: Minimum stake amount to filter
 *         example: 1000
 *     responses:
 *       200:
 *         description: List of identities
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedIdentities'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const states = req.query.states ? req.query.states.split(',') : null;
    const minStake = req.query.minStake ? parseFloat(req.query.minStake) : null;

    const cacheKey = cache.generateKey(
      'identities',
      limit,
      offset,
      states?.join('-') || 'all',
      minStake || 'any'
    );

    let result = await cache.get(cacheKey);

    if (!result) {
      result = await rpc.getFilteredIdentities({
        limit,
        offset,
        states,
        minStake,
      });

      // Cache for 2 minutes (more volatile data)
      await cache.set(cacheKey, result, 120);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
