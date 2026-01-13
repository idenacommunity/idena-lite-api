const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/balance/{address}:
 *   get:
 *     summary: Get balance by address
 *     description: Retrieves the balance and stake for a specific Idena address
 *     tags: [Balance]
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
 *         description: Balance information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 address:
 *                   type: string
 *                   description: Idena address
 *                 balance:
 *                   type: string
 *                   description: Available balance in iDNA
 *                   example: '1000.5'
 *                 stake:
 *                   type: string
 *                   description: Staked amount in iDNA
 *                   example: '500.25'
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
 *         description: Address not found
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

    const cacheKey = cache.generateKey('balance', address.toLowerCase());

    // Check cache
    let balanceData = await cache.get(cacheKey);

    if (!balanceData) {
      // Fetch from RPC
      balanceData = await rpc.getBalance(address);

      if (!balanceData) {
        return res.status(404).json({
          error: {
            message: 'Address not found',
            status: 404,
          },
        });
      }

      // Cache for 5 minutes
      await cache.set(cacheKey, balanceData, 300);
    }

    res.json({
      address,
      balance: balanceData.balance || '0',
      stake: balanceData.stake || '0',
      unit: 'iDNA',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
