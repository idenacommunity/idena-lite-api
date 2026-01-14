/**
 * Contract Routes
 * Smart contract queries and statistics
 */

const express = require('express');
const router = express.Router();
const historyDB = require('../db');

/**
 * @swagger
 * /api/contract:
 *   get:
 *     summary: Get all contracts (paginated)
 *     tags: [Contracts]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *           enum: [active, terminated]
 *         description: Filter by contract state
 *       - in: query
 *         name: deployer
 *         schema:
 *           type: string
 *         description: Filter by deployer address
 *     responses:
 *       200:
 *         description: List of contracts
 *       503:
 *         description: Contracts require historical sync
 */
router.get('/', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  const { limit = 50, offset = 0, state, deployer } = req.query;

  try {
    const result = historyDB.getContracts({
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      state: state || null,
      deployer: deployer || null,
    });

    res.json({
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/contract/stats:
 *   get:
 *     summary: Get contract statistics
 *     tags: [Contracts]
 *     responses:
 *       200:
 *         description: Contract statistics
 */
router.get('/stats', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  try {
    const stats = historyDB.getContractStats();
    res.json({
      result: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/contract/{address}:
 *   get:
 *     summary: Get contract by address
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract address
 *     responses:
 *       200:
 *         description: Contract details
 *       404:
 *         description: Contract not found
 */
router.get('/:address', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  const { address } = req.params;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_ADDRESS', message: 'Invalid contract address' },
    });
  }

  try {
    const contract = historyDB.getContract(address);

    if (!contract) {
      return res.status(404).json({
        error: { code: 'CONTRACT_NOT_FOUND', message: 'Contract not found' },
      });
    }

    res.json({
      result: contract,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/contract/{address}/calls:
 *   get:
 *     summary: Get contract calls (paginated)
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Contract address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: method
 *         schema:
 *           type: string
 *         description: Filter by method name
 *       - in: query
 *         name: caller
 *         schema:
 *           type: string
 *         description: Filter by caller address
 *     responses:
 *       200:
 *         description: Contract calls
 */
router.get('/:address/calls', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  const { address } = req.params;
  const { limit = 50, offset = 0, method, caller } = req.query;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_ADDRESS', message: 'Invalid contract address' },
    });
  }

  try {
    const result = historyDB.getContractCalls(address, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
      method: method || null,
      caller: caller || null,
    });

    res.json({
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/contract/deployer/{address}:
 *   get:
 *     summary: Get contracts deployed by an address
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Deployer address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Deployed contracts
 */
router.get('/deployer/:address', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  const { address } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_ADDRESS', message: 'Invalid deployer address' },
    });
  }

  try {
    const result = historyDB.getContractsByDeployer(address, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

/**
 * @swagger
 * /api/contract/caller/{address}:
 *   get:
 *     summary: Get contract calls made by an address
 *     tags: [Contracts]
 *     parameters:
 *       - in: path
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: Caller address
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Contract calls by address
 */
router.get('/caller/:address', (req, res) => {
  if (!historyDB.enabled) {
    return res.status(503).json({
      error: { code: 'CONTRACTS_UNAVAILABLE', message: 'Contracts require historical sync to be enabled' },
    });
  }

  const { address } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({
      error: { code: 'INVALID_ADDRESS', message: 'Invalid caller address' },
    });
  }

  try {
    const result = historyDB.getContractCallsByAddress(address, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      error: { code: 'CONTRACT_ERROR', message: error.message },
    });
  }
});

module.exports = router;
