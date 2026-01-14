const express = require('express');
const router = express.Router();
const historyDB = require('../db');

// Validate address format
const validateAddress = (address) => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * @swagger
 * /api/address/{address}:
 *   get:
 *     summary: Get full address information
 *     description: Returns comprehensive address info including balance, stake, identity state, and statistics
 *     tags: [Address]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{40}$'
 *         description: Idena address
 *     responses:
 *       200:
 *         description: Address information
 *       400:
 *         description: Invalid address format
 *       404:
 *         description: Address not found in historical data
 *       503:
 *         description: Historical database not available
 */
router.get('/:address', (req, res) => {
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

  const info = historyDB.getAddressInfo(address);

  if (!info) {
    return res.status(404).json({
      error: {
        message: `Address ${address} not found in historical data. It may not be synced yet.`,
        status: 404,
      },
    });
  }

  res.json({ result: info });
});

/**
 * @swagger
 * /api/address/{address}/balance/changes:
 *   get:
 *     summary: Get balance change history
 *     description: Returns paginated list of all balance-affecting events for an address
 *     tags: [Address]
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
 *           enum: [tx_in, tx_out, reward, penalty, stake, unstake]
 *         description: Filter by change type
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
 *         description: Balance change history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/:address/balance/changes', (req, res) => {
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
  const changeType = req.query.type || null;

  const result = historyDB.getAddressBalanceChanges(address, { limit, offset, changeType });
  res.json(result);
});

/**
 * @swagger
 * /api/address/{address}/penalties:
 *   get:
 *     summary: Get penalty history for address
 *     description: Returns paginated list of all penalties for an address
 *     tags: [Address]
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
 *         description: Filter by epoch
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
 *         description: Penalty history
 *       400:
 *         description: Invalid address format
 *       503:
 *         description: Historical database not available
 */
router.get('/:address/penalties', (req, res) => {
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

  const result = historyDB.getAddressPenalties(address, { limit, offset, epoch });
  res.json(result);
});

module.exports = router;
