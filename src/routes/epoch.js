const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');
const historyDB = require('../db');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/epoch/current:
 *   get:
 *     summary: Get current epoch
 *     description: Retrieves information about the current Idena epoch
 *     tags: [Epoch]
 *     responses:
 *       200:
 *         description: Current epoch information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   $ref: '#/components/schemas/Epoch'
 *       500:
 *         description: Failed to fetch epoch data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/current', async (req, res, next) => {
  try {
    const cacheKey = cache.generateKey('epoch', 'current');

    let epochData = await cache.get(cacheKey);

    if (!epochData) {
      epochData = await rpc.getEpoch();

      if (!epochData) {
        return res.status(500).json({
          error: {
            message: 'Failed to fetch epoch data',
            status: 500,
          },
        });
      }

      // Cache for 1 minute (epochs change infrequently but we want fresh data)
      await cache.set(cacheKey, epochData, 60);
    }

    res.json({
      result: epochData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /api/epoch/intervals:
 *   get:
 *     summary: Get ceremony intervals
 *     description: Retrieves the timing intervals for validation ceremony phases
 *     tags: [Epoch]
 *     responses:
 *       200:
 *         description: Ceremony interval timings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   $ref: '#/components/schemas/CeremonyIntervals'
 *       500:
 *         description: Failed to fetch ceremony intervals
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/intervals', async (req, res, next) => {
  try {
    const cacheKey = cache.generateKey('epoch', 'intervals');

    let intervals = await cache.get(cacheKey);

    if (!intervals) {
      intervals = await rpc.getCeremonyIntervals();

      if (!intervals) {
        return res.status(500).json({
          error: {
            message: 'Failed to fetch ceremony intervals',
            status: 500,
          },
        });
      }

      // Cache for 10 minutes
      await cache.set(cacheKey, intervals, 600);
    }

    res.json({
      result: intervals,
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Historical Epoch Endpoints (from SQLite)
// ==========================================

/**
 * @swagger
 * /api/epoch/last:
 *   get:
 *     summary: Get last synced epoch
 *     description: Returns the most recent epoch from the local database
 *     tags: [Epoch History]
 *     responses:
 *       200:
 *         description: Last epoch details
 *       503:
 *         description: Historical database not available
 */
router.get('/last', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled. Set HISTORY_ENABLED=true to enable.',
        status: 503,
      },
    });
  }

  const epoch = historyDB.getLastEpoch();

  if (!epoch) {
    return res.status(404).json({
      error: {
        message: 'No epochs synced yet',
        status: 404,
      },
    });
  }

  // Get identity summary for this epoch
  const identitySummary = historyDB.getEpochIdentitySummary(epoch.epoch);

  res.json({
    result: {
      ...epoch,
      identitySummary,
    },
  });
});

/**
 * @swagger
 * /api/epochs:
 *   get:
 *     summary: List all synced epochs
 *     description: Returns paginated list of epochs from the local database
 *     tags: [Epoch History]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of epochs
 *       503:
 *         description: Historical database not available
 */
router.get('/', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;

  const result = historyDB.getEpochs({ limit, offset });
  res.json(result);
});

/**
 * @swagger
 * /api/epoch/{epoch}:
 *   get:
 *     summary: Get specific epoch details
 *     description: Returns details for a specific epoch number
 *     tags: [Epoch History]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Epoch details
 *       400:
 *         description: Invalid epoch number
 *       404:
 *         description: Epoch not found
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const epoch = historyDB.getEpoch(epochNum);

  if (!epoch) {
    return res.status(404).json({
      error: {
        message: `Epoch ${epochNum} not found in local database. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  // Get identity summary for this epoch
  const identitySummary = historyDB.getEpochIdentitySummary(epochNum);

  res.json({
    result: {
      ...epoch,
      identitySummary,
    },
  });
});

/**
 * @swagger
 * /api/epoch/{epoch}/identities:
 *   get:
 *     summary: Get identities in an epoch
 *     description: Returns paginated list of identity states for a specific epoch
 *     tags: [Epoch History]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *         description: Filter by identity state (Human, Verified, etc.)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of identities in the epoch
 *       400:
 *         description: Invalid epoch number
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch/identities', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const state = req.query.state || null;

  const result = historyDB.getEpochIdentities(epochNum, { limit, offset, state });
  res.json(result);
});

/**
 * @swagger
 * /api/epoch/{epoch}/summary:
 *   get:
 *     summary: Get epoch identity summary
 *     description: Returns counts of identities by state for a specific epoch
 *     tags: [Epoch History]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Identity state counts
 *       400:
 *         description: Invalid epoch number
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch/summary', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const summary = historyDB.getEpochIdentitySummary(epochNum);

  if (!summary || Object.keys(summary).length === 0) {
    return res.status(404).json({
      error: {
        message: `No identity data for epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: summary });
});

// ==========================================
// Epoch Rewards Endpoints
// ==========================================

/**
 * @swagger
 * /api/epoch/{epoch}/rewards:
 *   get:
 *     summary: Get epoch rewards list
 *     description: Returns paginated list of addresses with their rewards for this epoch
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by reward type
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of results per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Offset for pagination
 *     responses:
 *       200:
 *         description: List of rewards for epoch
 *       400:
 *         description: Invalid epoch number
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch/rewards', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type || null;

  const result = historyDB.getEpochRewards(epochNum, { limit, offset, type });
  res.json(result);
});

/**
 * @swagger
 * /api/epoch/{epoch}/rewards/summary:
 *   get:
 *     summary: Get epoch rewards summary
 *     description: Returns reward totals by type for this epoch
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Rewards summary by type
 *       400:
 *         description: Invalid epoch number
 *       404:
 *         description: No reward data for this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch/rewards/summary', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const summary = historyDB.getEpochRewardsSummary(epochNum);

  if (!summary) {
    return res.status(404).json({
      error: {
        message: `No reward data for epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: summary });
});

/**
 * @swagger
 * /api/epoch/{epoch}/validation:
 *   get:
 *     summary: Get epoch validation summary
 *     description: Returns validation ceremony statistics for this epoch
 *     tags: [Validation]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Validation summary
 *       400:
 *         description: Invalid epoch number
 *       404:
 *         description: No validation data for this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/:epoch/validation', (req, res) => {
  const epochNum = parseInt(req.params.epoch);

  if (isNaN(epochNum) || epochNum < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid epoch number',
        status: 400,
      },
    });
  }

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const summary = historyDB.getEpochValidationSummary(epochNum);

  if (!summary) {
    return res.status(404).json({
      error: {
        message: `No validation data for epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: summary });
});

module.exports = router;
