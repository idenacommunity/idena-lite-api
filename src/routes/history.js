/**
 * Historical Query Routes
 *
 * Provides endpoints for querying historical blockchain data
 * stored in the local SQLite database.
 */

const express = require('express');
const router = express.Router();
const historyDB = require('../db');
const syncService = require('../sync');

/**
 * @swagger
 * /api/history/status:
 *   get:
 *     summary: Get sync status
 *     description: Returns the current state of the historical data sync process
 *     tags: [History]
 *     responses:
 *       200:
 *         description: Sync status information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                   description: Whether historical sync is enabled
 *                 running:
 *                   type: boolean
 *                   description: Whether sync is currently running
 *                 lastSyncedBlock:
 *                   type: integer
 *                   description: Last synced block height
 *                 highestKnownBlock:
 *                   type: integer
 *                   description: Current chain height
 *                 progress:
 *                   type: string
 *                   description: Sync progress percentage
 *                 database:
 *                   type: object
 *                   properties:
 *                     blockCount:
 *                       type: integer
 *                     txCount:
 *                       type: integer
 */
router.get('/status', (req, res) => {
  const status = syncService.getStatus();
  res.json(status);
});

/**
 * @swagger
 * /api/history/address/{address}/transactions:
 *   get:
 *     summary: Get transaction history for an address
 *     description: Returns paginated list of transactions sent or received by an address
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
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
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by transaction type
 *     responses:
 *       200:
 *         description: Transaction history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       hash:
 *                         type: string
 *                       blockHeight:
 *                         type: integer
 *                       epoch:
 *                         type: integer
 *                       type:
 *                         type: string
 *                       from:
 *                         type: string
 *                       to:
 *                         type: string
 *                       amount:
 *                         type: string
 *                       fee:
 *                         type: string
 *                       timestamp:
 *                         type: integer
 *                 total:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 offset:
 *                   type: integer
 *                 hasMore:
 *                   type: boolean
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/address/:address/transactions', (req, res) => {
  const { address } = req.params;

  // Validate address format
  if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
        status: 400,
      },
    });
  }

  // Check if history is enabled
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled. Set HISTORY_ENABLED=true to enable.',
        status: 503,
      },
    });
  }

  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = parseInt(req.query.offset) || 0;
  const type = req.query.type || null;

  const result = historyDB.getAddressTransactions(address, { limit, offset, type });

  if (result.error) {
    return res.status(503).json({
      error: {
        message: result.error,
        status: 503,
      },
    });
  }

  res.json(result);
});

/**
 * @swagger
 * /api/history/transaction/{hash}:
 *   get:
 *     summary: Get historical transaction by hash
 *     description: Returns transaction details from the local database
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{64}$'
 *         description: Transaction hash
 *     responses:
 *       200:
 *         description: Transaction details
 *       400:
 *         description: Invalid hash format
 *       404:
 *         description: Transaction not found in local database
 *       503:
 *         description: Historical database not available
 */
router.get('/transaction/:hash', (req, res) => {
  const { hash } = req.params;

  // Validate hash format
  if (!hash || !hash.match(/^0x[a-fA-F0-9]{64}$/)) {
    return res.status(400).json({
      error: {
        message: 'Invalid transaction hash format',
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

  const tx = historyDB.getTransaction(hash);

  if (!tx) {
    return res.status(404).json({
      error: {
        message: 'Transaction not found in local database. It may not be synced yet.',
        status: 404,
      },
    });
  }

  res.json({ result: tx });
});

/**
 * @swagger
 * /api/history/block/{height}:
 *   get:
 *     summary: Get historical block by height
 *     description: Returns block details from the local database
 *     tags: [History]
 *     parameters:
 *       - in: path
 *         name: height
 *         required: true
 *         schema:
 *           type: integer
 *         description: Block height
 *     responses:
 *       200:
 *         description: Block details
 *       400:
 *         description: Invalid height
 *       404:
 *         description: Block not found in local database
 *       503:
 *         description: Historical database not available
 */
router.get('/block/:height', (req, res) => {
  const height = parseInt(req.params.height);

  if (isNaN(height) || height < 0) {
    return res.status(400).json({
      error: {
        message: 'Invalid block height',
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

  const block = historyDB.getBlock(height);

  if (!block) {
    return res.status(404).json({
      error: {
        message: 'Block not found in local database. It may not be synced yet.',
        status: 404,
      },
    });
  }

  res.json({ result: block });
});

module.exports = router;
