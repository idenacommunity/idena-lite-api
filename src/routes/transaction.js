const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/transaction/{hash}:
 *   get:
 *     summary: Get transaction by hash
 *     description: Retrieves transaction details for a specific transaction hash
 *     tags: [Transaction]
 *     parameters:
 *       - in: path
 *         name: hash
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^0x[a-fA-F0-9]{64}$'
 *         description: Transaction hash (0x followed by 64 hex characters)
 *         example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
 *     responses:
 *       200:
 *         description: Transaction found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     hash:
 *                       type: string
 *                       description: Transaction hash
 *                     type:
 *                       type: string
 *                       description: Transaction type
 *                       example: 'send'
 *                     from:
 *                       type: string
 *                       description: Sender address
 *                     to:
 *                       type: string
 *                       description: Recipient address
 *                     amount:
 *                       type: string
 *                       description: Amount transferred in iDNA
 *                     tips:
 *                       type: string
 *                       description: Tips amount
 *                     maxFee:
 *                       type: string
 *                       description: Maximum fee
 *                     nonce:
 *                       type: integer
 *                       description: Transaction nonce
 *                     epoch:
 *                       type: integer
 *                       description: Epoch number
 *                     blockHash:
 *                       type: string
 *                       description: Block hash containing the transaction
 *                     timestamp:
 *                       type: integer
 *                       description: Unix timestamp
 *       400:
 *         description: Invalid transaction hash format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:hash', async (req, res, next) => {
  try {
    const { hash } = req.params;

    // Validate transaction hash format (0x + 64 hex characters)
    if (!hash || !hash.match(/^0x[a-fA-F0-9]{64}$/)) {
      return res.status(400).json({
        error: {
          message: 'Invalid transaction hash format',
          status: 400,
        },
      });
    }

    const cacheKey = cache.generateKey('transaction', hash.toLowerCase());

    // Check cache
    let txData = await cache.get(cacheKey);

    if (!txData) {
      // Fetch from RPC
      txData = await rpc.getTransaction(hash);

      if (!txData) {
        return res.status(404).json({
          error: {
            message: 'Transaction not found',
            status: 404,
          },
        });
      }

      // Cache for 10 minutes (transactions are immutable once confirmed)
      await cache.set(cacheKey, txData, 600);
    }

    res.json({
      result: txData,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
