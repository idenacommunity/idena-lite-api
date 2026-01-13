const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

/**
 * @swagger
 * /api/block/{heightOrHash}:
 *   get:
 *     summary: Get block by height or hash
 *     description: Retrieves block details by block height (number) or block hash (0x string)
 *     tags: [Block]
 *     parameters:
 *       - in: path
 *         name: heightOrHash
 *         required: true
 *         schema:
 *           oneOf:
 *             - type: integer
 *               description: Block height
 *               example: 12345
 *             - type: string
 *               pattern: '^0x[a-fA-F0-9]{64}$'
 *               description: Block hash
 *         description: Block height (number) or block hash (0x followed by 64 hex characters)
 *     responses:
 *       200:
 *         description: Block found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: object
 *                   properties:
 *                     height:
 *                       type: integer
 *                       description: Block height
 *                     hash:
 *                       type: string
 *                       description: Block hash
 *                     parentHash:
 *                       type: string
 *                       description: Parent block hash
 *                     timestamp:
 *                       type: integer
 *                       description: Unix timestamp
 *                     root:
 *                       type: string
 *                       description: State root hash
 *                     identityRoot:
 *                       type: string
 *                       description: Identity root hash
 *                     proposer:
 *                       type: string
 *                       description: Block proposer address
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: Transaction hashes in the block
 *       400:
 *         description: Invalid block height or hash format
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Block not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:heightOrHash', async (req, res, next) => {
  try {
    const { heightOrHash } = req.params;

    let blockData;
    let cacheKey;

    // Check if it's a block hash (0x + 64 hex characters)
    if (heightOrHash.match(/^0x[a-fA-F0-9]{64}$/)) {
      cacheKey = cache.generateKey('block', 'hash', heightOrHash.toLowerCase());

      // Check cache
      blockData = await cache.get(cacheKey);

      if (!blockData) {
        blockData = await rpc.getBlockByHash(heightOrHash);
      }
    }
    // Check if it's a valid block height (non-negative integer)
    // Note: /^\d+$/ only matches non-negative integers, so no need to check height < 0
    else if (/^\d+$/.test(heightOrHash)) {
      const height = parseInt(heightOrHash, 10);

      cacheKey = cache.generateKey('block', 'height', height.toString());

      // Check cache
      blockData = await cache.get(cacheKey);

      if (!blockData) {
        blockData = await rpc.getBlockByHeight(height);
      }
    } else {
      return res.status(400).json({
        error: {
          message:
            'Invalid block identifier. Provide a block height (number) or block hash (0x + 64 hex)',
          status: 400,
        },
      });
    }

    if (!blockData) {
      return res.status(404).json({
        error: {
          message: 'Block not found',
          status: 404,
        },
      });
    }

    // Cache for 10 minutes (blocks are immutable once confirmed)
    await cache.set(cacheKey, blockData, 600);

    res.json({
      result: blockData,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
