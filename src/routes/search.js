/**
 * Search Routes
 * Full-text search across blockchain data
 */

const express = require('express');
const router = express.Router();
const historyDB = require('../db');

/**
 * @swagger
 * /api/search:
 *   get:
 *     summary: Search across addresses, transactions, and blocks
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (address, tx hash, block hash, or block height)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum results per type
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Missing or invalid query
 *       503:
 *         description: Search not available
 */
router.get('/', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'SEARCH_UNAVAILABLE', message: 'Search requires historical sync to be enabled' },
    });
  }

  const { q, limit = 20 } = req.query;

  if (!q || q.trim().length < 2) {
    return res.status(400).json({
      error: { code: 'INVALID_QUERY', message: 'Query must be at least 2 characters' },
    });
  }

  try {
    const results = historyDB.search(q.trim(), { limit: parseInt(limit, 10) });
    res.json({
      query: q.trim(),
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'SEARCH_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/search/addresses:
 *   get:
 *     summary: Search addresses by prefix
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         required: true
 *         schema:
 *           type: string
 *         description: Address prefix (must start with 0x)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching addresses
 */
router.get('/addresses', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'SEARCH_UNAVAILABLE', message: 'Search requires historical sync to be enabled' },
    });
  }

  const { prefix, limit = 20 } = req.query;

  if (!prefix || !prefix.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_PREFIX', message: 'Address prefix must start with 0x' },
    });
  }

  try {
    const addresses = historyDB.searchAddresses(prefix, parseInt(limit, 10));
    res.json({
      prefix,
      addresses,
      count: addresses.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'SEARCH_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/search/transactions:
 *   get:
 *     summary: Search transactions by hash prefix
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: prefix
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction hash prefix (must start with 0x)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching transactions
 */
router.get('/transactions', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'SEARCH_UNAVAILABLE', message: 'Search requires historical sync to be enabled' },
    });
  }

  const { prefix, limit = 20 } = req.query;

  if (!prefix || !prefix.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_PREFIX', message: 'Transaction hash prefix must start with 0x' },
    });
  }

  try {
    const transactions = historyDB.searchTransactions(prefix, parseInt(limit, 10));
    res.json({
      prefix,
      transactions,
      count: transactions.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'SEARCH_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/search/blocks:
 *   get:
 *     summary: Search blocks by hash prefix or height
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Block hash prefix or height prefix
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching blocks
 */
router.get('/blocks', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'SEARCH_UNAVAILABLE', message: 'Search requires historical sync to be enabled' },
    });
  }

  const { q, limit = 20 } = req.query;

  if (!q || q.trim().length < 1) {
    return res.status(400).json({
      error: { code: 'INVALID_QUERY', message: 'Query is required' },
    });
  }

  try {
    const blocks = historyDB.searchBlocks(q.trim(), parseInt(limit, 10));
    res.json({
      query: q.trim(),
      blocks,
      count: blocks.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'SEARCH_ERROR', message: error.message },
    });
  }
});

module.exports = router;
