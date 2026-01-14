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

// ==========================================
// Identity State History Endpoints
// ==========================================

/**
 * Helper to validate address format
 */
function validateAddress(address) {
  return address && address.match(/^0x[a-fA-F0-9]{40}$/);
}

/**
 * @swagger
 * /api/history/identity/{address}/epochs:
 *   get:
 *     summary: Get identity history across epochs
 *     description: Returns the state of an identity across all synced epochs
 *     tags: [Identity History]
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
 *         description: Identity history across epochs
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/epochs', (req, res) => {
  const { address } = req.params;

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
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

  const result = historyDB.getIdentityEpochs(address, { limit, offset });
  res.json(result);
});

/**
 * @swagger
 * /api/history/identity/{address}/state/{epoch}:
 *   get:
 *     summary: Get identity state at specific epoch
 *     description: Returns the state of an identity at a specific epoch
 *     tags: [Identity History]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Identity state at the specified epoch
 *       400:
 *         description: Invalid address or epoch
 *       404:
 *         description: Identity state not found for this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/state/:epoch', (req, res) => {
  const { address } = req.params;
  const epochNum = parseInt(req.params.epoch);

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
        status: 400,
      },
    });
  }

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

  const state = historyDB.getIdentityState(address, epochNum);

  if (!state) {
    return res.status(404).json({
      error: {
        message: `Identity state not found for ${address} at epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: state });
});

// ==========================================
// Address State History Endpoints
// ==========================================

/**
 * @swagger
 * /api/history/address/{address}/states:
 *   get:
 *     summary: Get address balance history across epochs
 *     description: Returns balance and stake snapshots for an address across epochs
 *     tags: [Address History]
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
 *         description: Address state history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/address/:address/states', (req, res) => {
  const { address } = req.params;

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
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

  const result = historyDB.getAddressStates(address, { limit, offset });
  res.json(result);
});

/**
 * @swagger
 * /api/history/address/{address}/state/{epoch}:
 *   get:
 *     summary: Get address state at specific epoch
 *     description: Returns balance and stake snapshot for an address at a specific epoch
 *     tags: [Address History]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Address state at the specified epoch
 *       400:
 *         description: Invalid address or epoch
 *       404:
 *         description: Address state not found for this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/address/:address/state/:epoch', (req, res) => {
  const { address } = req.params;
  const epochNum = parseInt(req.params.epoch);

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
        status: 400,
      },
    });
  }

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

  const state = historyDB.getAddressState(address, epochNum);

  if (!state) {
    return res.status(404).json({
      error: {
        message: `Address state not found for ${address} at epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: state });
});

// ==========================================
// Rewards History Endpoints
// ==========================================

/**
 * @swagger
 * /api/history/identity/{address}/rewards:
 *   get:
 *     summary: Get identity rewards history
 *     description: Returns all rewards for an identity across epochs
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: query
 *         name: epoch
 *         schema:
 *           type: integer
 *         description: Filter by specific epoch
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *         description: Filter by reward type (validation, flip, invite, etc.)
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
 *         description: Rewards history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/rewards', (req, res) => {
  const { address } = req.params;

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
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
  const epoch = req.query.epoch ? parseInt(req.query.epoch) : null;
  const type = req.query.type || null;

  const result = historyDB.getIdentityRewards(address, { limit, offset, epoch, type });
  res.json(result);
});

/**
 * @swagger
 * /api/history/identity/{address}/rewards/{epoch}:
 *   get:
 *     summary: Get identity rewards at specific epoch
 *     description: Returns detailed rewards breakdown for an identity at a specific epoch
 *     tags: [Rewards]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Rewards at epoch
 *       400:
 *         description: Invalid address or epoch
 *       404:
 *         description: No rewards found for this identity at this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/rewards/:epoch', (req, res) => {
  const { address } = req.params;
  const epochNum = parseInt(req.params.epoch);

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
        status: 400,
      },
    });
  }

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

  const rewards = historyDB.getIdentityRewardsAtEpoch(address, epochNum);

  if (!rewards) {
    return res.status(404).json({
      error: {
        message: `No rewards found for ${address} at epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: rewards });
});

// ==========================================
// Validation History Endpoints
// ==========================================

/**
 * @swagger
 * /api/history/identity/{address}/validation:
 *   get:
 *     summary: Get identity validation history
 *     description: Returns validation ceremony results across all epochs
 *     tags: [Validation]
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
 *         description: Validation history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/validation', (req, res) => {
  const { address } = req.params;

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
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

  const result = historyDB.getIdentityValidationHistory(address, { limit, offset });
  res.json(result);
});

/**
 * @swagger
 * /api/history/identity/{address}/validation/{epoch}:
 *   get:
 *     summary: Get identity validation result at specific epoch
 *     description: Returns detailed validation ceremony results for an identity at a specific epoch
 *     tags: [Validation]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Validation result at epoch
 *       400:
 *         description: Invalid address or epoch
 *       404:
 *         description: No validation data found for this identity at this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/validation/:epoch', (req, res) => {
  const { address } = req.params;
  const epochNum = parseInt(req.params.epoch);

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
        status: 400,
      },
    });
  }

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

  const result = historyDB.getValidationResult(address, epochNum);

  if (!result) {
    return res.status(404).json({
      error: {
        message: `No validation data found for ${address} at epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result });
});

// ==========================================
// Invite Endpoints
// ==========================================

/**
 * @swagger
 * /api/history/identity/{address}/invites:
 *   get:
 *     summary: Get invite history for an address
 *     description: Returns all invites sent or received by an address
 *     tags: [Invites]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [sent, received]
 *         description: Filter by invite direction (sent or received)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, activated, expired]
 *         description: Filter by invite status
 *       - in: query
 *         name: epoch
 *         schema:
 *           type: integer
 *         description: Filter by specific epoch
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
 *         description: Invite history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/identity/:address/invites', (req, res) => {
  const { address } = req.params;

  if (!validateAddress(address)) {
    return res.status(400).json({
      error: {
        message: 'Invalid address format',
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
  const epoch = req.query.epoch ? parseInt(req.query.epoch) : null;
  const status = req.query.status || null;
  const type = req.query.type || null;

  const result = historyDB.getAddressInvites(address, { limit, offset, epoch, status, type });
  res.json(result);
});

/**
 * @swagger
 * /api/history/epoch/{epoch}/invites:
 *   get:
 *     summary: Get invites for a specific epoch
 *     description: Returns all invites created in a specific epoch
 *     tags: [Invites]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, activated, expired]
 *         description: Filter by invite status
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
 *         description: Epoch invites
 *       400:
 *         description: Invalid epoch number
 *       503:
 *         description: Historical database not available
 */
router.get('/epoch/:epoch/invites', (req, res) => {
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
  const status = req.query.status || null;

  const result = historyDB.getEpochInvites(epochNum, { limit, offset, status });
  res.json(result);
});

/**
 * @swagger
 * /api/history/epoch/{epoch}/invites/summary:
 *   get:
 *     summary: Get invite summary for an epoch
 *     description: Returns statistics about invites in a specific epoch
 *     tags: [Invites]
 *     parameters:
 *       - in: path
 *         name: epoch
 *         required: true
 *         schema:
 *           type: integer
 *         description: Epoch number
 *     responses:
 *       200:
 *         description: Invite summary
 *       400:
 *         description: Invalid epoch number
 *       404:
 *         description: No invite data for this epoch
 *       503:
 *         description: Historical database not available
 */
router.get('/epoch/:epoch/invites/summary', (req, res) => {
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

  const result = historyDB.getEpochInvitesSummary(epochNum);

  if (!result) {
    return res.status(404).json({
      error: {
        message: `No invite data for epoch ${epochNum}. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result });
});

/**
 * @swagger
 * /api/history/invite/{hash}:
 *   get:
 *     summary: Get invite by hash
 *     description: Returns details of a specific invite transaction
 *     tags: [Invites]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *         description: Invite transaction hash
 *     responses:
 *       200:
 *         description: Invite details
 *       404:
 *         description: Invite not found
 *       503:
 *         description: Historical database not available
 */
router.get('/invite/:hash', (req, res) => {
  const { hash } = req.params;

  if (!historyDB.enabled) {
    return res.status(503).json({
      error: {
        message: 'Historical database not enabled',
        status: 503,
      },
    });
  }

  const result = historyDB.getInvite(hash);

  if (!result) {
    return res.status(404).json({
      error: {
        message: `Invite ${hash} not found in historical data.`,
        status: 404,
      },
    });
  }

  res.json({ result });
});

module.exports = router;
