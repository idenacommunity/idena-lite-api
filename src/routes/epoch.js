const express = require('express');
const router = express.Router();
const IdenaRPC = require('../rpc');
const cache = require('../cache');

const rpc = new IdenaRPC();

// GET /api/epoch/current
router.get('/current', async (req, res, next) => {
  try {
    const cacheKey = cache.generateKey('epoch', 'current');
    
    let epochData = await cache.get(cacheKey);
    
    if (!epochData) {
      epochData = await rpc.getEpoch();
      
      if (!epochData) {
        return res.status(500).json({
          error: {
            message: 'Failed to fetch epoch data',
            status: 500
          }
        });
      }

      // Cache for 1 minute (epochs change infrequently but we want fresh data)
      await cache.set(cacheKey, epochData, 60);
    }

    res.json({
      result: epochData
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/epoch/intervals
router.get('/intervals', async (req, res, next) => {
  try {
    const cacheKey = cache.generateKey('epoch', 'intervals');
    
    let intervals = await cache.get(cacheKey);
    
    if (!intervals) {
      intervals = await rpc.getCeremonyIntervals();
      
      if (!intervals) {
        return res.status(500).json({
          error: {
            message: 'Failed to fetch ceremony intervals',
            status: 500
          }
        });
      }

      // Cache for 10 minutes
      await cache.set(cacheKey, intervals, 600);
    }

    res.json({
      result: intervals
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
