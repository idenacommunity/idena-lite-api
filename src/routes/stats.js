/**
 * Network Statistics Routes
 *
 * Provides endpoints for querying network-wide statistics
 * like online identities count and coin supply.
 */

const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const historyDB = require('../db');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/stats/online:
 *   get:
 *     summary: Get online identities count
 *     description: Returns the number of currently online identities
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Online identities count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     online:
 *                       type: integer
 *                       description: Number of online identities
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       500:
 *         description: Failed to fetch online count
 */
router.get('/online', async (req, res) => {
  try {
    // Try to get online miners count from RPC
    const result = await rpc.call('dna_onlineMiners', []);

    res.json({
      result: {
        online: result?.length || 0,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    // Fallback: try alternative RPC method
    try {
      const identities = await rpc.call('dna_onlineIdentities', []);
      res.json({
        result: {
          online: identities?.length || 0,
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      res.status(500).json({
        error: {
          message: 'Failed to fetch online identities count',
          status: 500,
        },
      });
    }
  }
});

/**
 * @swagger
 * /api/stats/coins:
 *   get:
 *     summary: Get coin supply statistics
 *     description: Returns coin supply information including total, circulating, and staked
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Coin supply statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     totalSupply:
 *                       type: string
 *                       description: Total coin supply
 *                     circulatingSupply:
 *                       type: string
 *                       description: Circulating supply (excludes staked)
 *                     staked:
 *                       type: string
 *                       description: Total staked coins
 *                     burnt:
 *                       type: string
 *                       description: Total burnt coins
 *       500:
 *         description: Failed to fetch coin supply
 */
router.get('/coins', async (req, res) => {
  try {
    // Get coin supply from RPC
    const coinsResult = await rpc.call('dna_getCoinbaseBurnRate', []);
    const stakingResult = await rpc.call('dna_staking', []);

    // Calculate supply values
    const totalSupply = coinsResult?.totalSupply || '0';
    const staked = stakingResult?.totalStaked || '0';
    const burnt = coinsResult?.totalBurnt || '0';

    // Circulating = Total - Staked - Burnt
    const totalNum = parseFloat(totalSupply) || 0;
    const stakedNum = parseFloat(staked) || 0;
    const burntNum = parseFloat(burnt) || 0;
    const circulatingNum = totalNum - stakedNum - burntNum;

    res.json({
      result: {
        totalSupply,
        circulatingSupply: circulatingNum > 0 ? circulatingNum.toString() : '0',
        staked,
        burnt,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(500).json({
      error: {
        message: 'Failed to fetch coin supply statistics',
        status: 500,
      },
    });
  }
});

/**
 * @swagger
 * /api/stats/identities:
 *   get:
 *     summary: Get identity statistics
 *     description: Returns counts of identities by state
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Identity statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     byState:
 *                       type: object
 *       500:
 *         description: Failed to fetch identity statistics
 */
router.get('/identities', async (req, res) => {
  try {
    // Get all identities from RPC
    const identities = await rpc.call('dna_identities', []);

    if (!identities || !Array.isArray(identities)) {
      return res.json({
        result: {
          total: 0,
          byState: {},
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Count by state
    const byState = {};
    for (const identity of identities) {
      const state = identity.state || 'Unknown';
      byState[state] = (byState[state] || 0) + 1;
    }

    res.json({
      result: {
        total: identities.length,
        byState,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(500).json({
      error: {
        message: 'Failed to fetch identity statistics',
        status: 500,
      },
    });
  }
});

/**
 * @swagger
 * /api/stats/summary:
 *   get:
 *     summary: Get network summary
 *     description: Returns a comprehensive network summary from historical data
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Network summary
 *       503:
 *         description: Historical database not available
 */
router.get('/summary', async (req, res) => {
  try {
    // Get database stats
    const dbStats = historyDB.getStats();

    // Get current epoch from RPC
    let currentEpoch = null;
    try {
      const epochResult = await rpc.call('dna_epoch', []);
      currentEpoch = epochResult?.epoch || null;
    } catch {
      // Ignore RPC errors for epoch
    }

    res.json({
      result: {
        database: dbStats,
        currentEpoch,
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(500).json({
      error: {
        message: 'Failed to fetch network summary',
        status: 500,
      },
    });
  }
});

/**
 * @swagger
 * /api/stats/epoch/{epoch}:
 *   get:
 *     summary: Get statistics for a specific epoch
 *     description: Returns comprehensive statistics for a historical epoch
 *     tags: [Stats]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Epoch statistics
 *       400:
 *         description: Invalid epoch number
 *       404:
 *         description: Epoch not found
 *       503:
 *         description: Historical database not available
 */
router.get('/epoch/:epoch', (req, res) => {
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

  // Get epoch data
  const epoch = historyDB.getEpoch(epochNum);
  if (!epoch) {
    return res.status(404).json({
      error: {
        message: `Epoch ${epochNum} not found in historical data`,
        status: 404,
      },
    });
  }

  // Get invite summary for this epoch
  const inviteSummary = historyDB.getEpochInvitesSummary(epochNum);

  // Get penalty summary for this epoch
  const penaltySummary = historyDB.getEpochPenaltySummary(epochNum);

  res.json({
    result: {
      epoch: epoch,
      invites: inviteSummary,
      penalties: penaltySummary,
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
