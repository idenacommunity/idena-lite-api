const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

// GET /api/identity/:address
router.get('/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    
    // Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: {
          message: 'Invalid Idena address format',
          status: 400
        }
      });
    }

    const cacheKey = cache.generateKey('identity', address.toLowerCase());
    
    // Check cache
    let identity = await cache.get(cacheKey);
    
    if (!identity) {
      // Fetch from RPC
      identity = await rpc.getIdentity(address);
      
      if (!identity) {
        return res.status(404).json({
          error: {
            message: 'Identity not found',
            status: 404
          }
        });
      }

      // Cache for 5 minutes
      await cache.set(cacheKey, identity, 300);
    }

    res.json({
      result: identity,
      cached: !!identity.cached
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/identity/:address/stake
router.get('/:address/stake', async (req, res, next) => {
  try {
    const { address } = req.params;
    
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return res.status(400).json({
        error: {
          message: 'Invalid Idena address format',
          status: 400
        }
      });
    }

    const cacheKey = cache.generateKey('stake', address.toLowerCase());
    
    let stake = await cache.get(cacheKey);
    
    if (stake === null) {
      const identity = await rpc.getIdentity(address);
      
      if (!identity) {
        return res.status(404).json({
          error: {
            message: 'Identity not found',
            status: 404
          }
        });
      }

      stake = identity.stake || '0';
      await cache.set(cacheKey, stake, 300);
    }

    res.json({
      address,
      stake,
      unit: 'iDNA'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/identities?limit=100&offset=0&states=Human,Verified&minStake=1000
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
    const offset = parseInt(req.query.offset) || 0;
    const states = req.query.states ? req.query.states.split(',') : null;
    const minStake = req.query.minStake ? parseFloat(req.query.minStake) : null;

    const cacheKey = cache.generateKey(
      'identities',
      limit,
      offset,
      states?.join('-') || 'all',
      minStake || 'any'
    );

    let result = await cache.get(cacheKey);

    if (!result) {
      result = await rpc.getFilteredIdentities({
        limit,
        offset,
        states,
        minStake
      });

      // Cache for 2 minutes (more volatile data)
      await cache.set(cacheKey, result, 120);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
