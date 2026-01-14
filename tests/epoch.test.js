// Create mock functions for RPC
const mockGetEpoch = jest.fn();
const mockGetCeremonyIntervals = jest.fn();

// Create mock functions for historyDB
const mockDbGetLastEpoch = jest.fn();
const mockDbGetEpoch = jest.fn();
const mockDbGetEpochs = jest.fn();
const mockDbGetEpochIdentities = jest.fn();
const mockDbGetEpochIdentitySummary = jest.fn();
const mockDbGetEpochRewards = jest.fn();
const mockDbGetEpochRewardsSummary = jest.fn();
const mockDbGetEpochValidationSummary = jest.fn();
const mockDbGetEpochPenalties = jest.fn();
const mockDbGetEpochPenaltySummary = jest.fn();

// Mock RPC module
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getEpoch: mockGetEpoch,
    getCeremonyIntervals: mockGetCeremonyIntervals,
  }));
});

// Mock db module
jest.mock('../src/db', () => ({
  enabled: true,
  getLastEpoch: mockDbGetLastEpoch,
  getEpoch: mockDbGetEpoch,
  getEpochs: mockDbGetEpochs,
  getEpochIdentities: mockDbGetEpochIdentities,
  getEpochIdentitySummary: mockDbGetEpochIdentitySummary,
  getEpochRewards: mockDbGetEpochRewards,
  getEpochRewardsSummary: mockDbGetEpochRewardsSummary,
  getEpochValidationSummary: mockDbGetEpochValidationSummary,
  getEpochPenalties: mockDbGetEpochPenalties,
  getEpochPenaltySummary: mockDbGetEpochPenaltySummary,
}));

const request = require('supertest');
const app = require('../src/server');
const cache = require('../src/cache');
const historyDB = require('../src/db');

describe('Epoch Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure historyDB.enabled is reset to true before each test
    historyDB.enabled = true;
  });

  describe('GET /api/epoch/current', () => {
    it('should return current epoch data', async () => {
      const mockEpochData = {
        epoch: 100,
        nextValidation: '2026-02-15T12:00:00Z',
        currentPeriod: 'None',
      };
      mockGetEpoch.mockResolvedValueOnce(mockEpochData);

      const response = await request(app).get('/api/epoch/current').expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result.epoch).toBe(100);
      expect(mockGetEpoch).toHaveBeenCalled();
    });

    it('should return 500 when epoch data is null', async () => {
      mockGetEpoch.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/epoch/current').expect(500);

      expect(response.body.error.message).toBe('Failed to fetch epoch data');
    });

    it('should handle RPC errors', async () => {
      mockGetEpoch.mockRejectedValueOnce(new Error('RPC failed'));

      await request(app).get('/api/epoch/current').expect(500);
    });

    it('should return cached epoch when available', async () => {
      const cachedEpoch = {
        epoch: 150,
        nextValidation: '2026-03-15T12:00:00Z',
        currentPeriod: 'ShortSession',
      };

      jest.spyOn(cache, 'get').mockResolvedValueOnce(cachedEpoch);

      const response = await request(app).get('/api/epoch/current').expect(200);

      expect(response.body.result.epoch).toBe(150);
      expect(mockGetEpoch).not.toHaveBeenCalled();

      cache.get.mockRestore();
    });
  });

  describe('GET /api/epoch/intervals', () => {
    it('should return ceremony intervals', async () => {
      const mockIntervals = {
        FlipLotteryDuration: 7200,
        ShortSessionDuration: 900,
        LongSessionDuration: 1800,
      };
      mockGetCeremonyIntervals.mockResolvedValueOnce(mockIntervals);

      const response = await request(app).get('/api/epoch/intervals').expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toMatchObject(mockIntervals);
      expect(mockGetCeremonyIntervals).toHaveBeenCalled();
    });

    it('should return 500 when intervals are null', async () => {
      mockGetCeremonyIntervals.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/epoch/intervals').expect(500);

      expect(response.body.error.message).toBe('Failed to fetch ceremony intervals');
    });

    it('should handle RPC errors', async () => {
      mockGetCeremonyIntervals.mockRejectedValueOnce(new Error('RPC failed'));

      await request(app).get('/api/epoch/intervals').expect(500);
    });

    it('should return cached intervals when available', async () => {
      const cachedIntervals = {
        FlipLotteryDuration: 7200,
        ShortSessionDuration: 900,
        LongSessionDuration: 1800,
      };

      jest.spyOn(cache, 'get').mockResolvedValueOnce(cachedIntervals);

      const response = await request(app).get('/api/epoch/intervals').expect(200);

      expect(response.body.result).toMatchObject(cachedIntervals);
      expect(mockGetCeremonyIntervals).not.toHaveBeenCalled();

      cache.get.mockRestore();
    });
  });

  // ==========================================
  // Historical Epoch Endpoints Tests
  // ==========================================

  describe('GET /api/epoch/last', () => {
    it('should return last epoch from database', async () => {
      const mockEpochData = {
        epoch: 150,
        startBlock: 5000000,
        endBlock: 5100000,
        startTimestamp: 1704067200,
        endTimestamp: 1704167200,
      };
      mockDbGetLastEpoch.mockReturnValue(mockEpochData);
      mockDbGetEpochIdentitySummary.mockReturnValue({ Human: 100, Verified: 50 });

      const response = await request(app).get('/api/epoch/last').expect(200);

      expect(response.body.result.epoch).toBe(150);
      expect(response.body.result.identitySummary).toEqual({ Human: 100, Verified: 50 });
    });

    it('should return 404 when no epochs exist', async () => {
      mockDbGetLastEpoch.mockReturnValue(null);

      const response = await request(app).get('/api/epoch/last').expect(404);

      expect(response.body.error.message).toBe('No epochs synced yet');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app).get('/api/epoch/last').expect(503);

      expect(response.body.error.message).toContain('not enabled');
      historyDB.enabled = true;
    });
  });

  describe('GET /api/epochs', () => {
    it('should return paginated epochs', async () => {
      const mockResult = {
        data: [
          { epoch: 150, startBlock: 5000000 },
          { epoch: 149, startBlock: 4900000 },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockDbGetEpochs.mockReturnValue(mockResult);

      const response = await request(app).get('/api/epochs').expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(50);
    });

    it('should support limit and offset parameters', async () => {
      mockDbGetEpochs.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app).get('/api/epochs?limit=10&offset=5').expect(200);

      expect(mockDbGetEpochs).toHaveBeenCalledWith({ limit: 10, offset: 5 });
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epochs').expect(503);

      historyDB.enabled = true;
    });
  });

  describe('GET /api/epoch/:epoch', () => {
    it('should return specific epoch details', async () => {
      const mockEpochData = {
        epoch: 150,
        startBlock: 5000000,
        endBlock: 5100000,
      };
      mockDbGetEpoch.mockReturnValue(mockEpochData);
      mockDbGetEpochIdentitySummary.mockReturnValue({ Human: 100 });

      const response = await request(app).get('/api/epoch/150').expect(200);

      expect(response.body.result.epoch).toBe(150);
      expect(mockDbGetEpoch).toHaveBeenCalledWith(150);
    });

    it('should return 400 for invalid epoch number', async () => {
      const response = await request(app).get('/api/epoch/invalid').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 404 when epoch not found', async () => {
      mockDbGetEpoch.mockReturnValue(null);

      const response = await request(app).get('/api/epoch/999').expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150').expect(503);

      historyDB.enabled = true;
    });
  });

  describe('GET /api/epoch/:epoch/identities', () => {
    it('should return identities in epoch', async () => {
      const mockResult = {
        data: [
          { address: '0xaddr1', state: 'Human' },
          { address: '0xaddr2', state: 'Verified' },
        ],
        total: 2,
        hasMore: false,
      };
      mockDbGetEpochIdentities.mockReturnValue(mockResult);

      const response = await request(app).get('/api/epoch/150/identities').expect(200);

      expect(response.body.data.length).toBe(2);
    });

    it('should support state filter', async () => {
      mockDbGetEpochIdentities.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app).get('/api/epoch/150/identities?state=Human').expect(200);

      expect(mockDbGetEpochIdentities).toHaveBeenCalledWith(150, expect.objectContaining({ state: 'Human' }));
    });

    it('should return 400 for invalid epoch', async () => {
      await request(app).get('/api/epoch/invalid/identities').expect(400);
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/identities').expect(503);

      historyDB.enabled = true;
    });
  });

  describe('GET /api/epoch/:epoch/summary', () => {
    it('should return identity summary for epoch', async () => {
      mockDbGetEpochIdentitySummary.mockReturnValue({ Human: 100, Verified: 50, Newbie: 25 });

      const response = await request(app).get('/api/epoch/150/summary').expect(200);

      expect(response.body.result.Human).toBe(100);
      expect(response.body.result.Verified).toBe(50);
    });

    it('should return 404 when no data for epoch', async () => {
      mockDbGetEpochIdentitySummary.mockReturnValue({});

      const response = await request(app).get('/api/epoch/999/summary').expect(404);

      expect(response.body.error.message).toContain('No identity data');
    });

    it('should return 400 for invalid epoch', async () => {
      await request(app).get('/api/epoch/invalid/summary').expect(400);
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/summary').expect(503);

      historyDB.enabled = true;
    });
  });

  // ==========================================
  // Epoch Rewards Endpoints Tests
  // ==========================================

  describe('GET /api/epoch/:epoch/rewards', () => {
    it('should return paginated rewards list', async () => {
      const mockResult = {
        data: [
          { address: '0xaddr1', type: 'validation', amount: '100.5' },
          { address: '0xaddr2', type: 'flip', amount: '25.0' },
        ],
        total: 1000,
        limit: 50,
        offset: 0,
        hasMore: true,
      };
      mockDbGetEpochRewards.mockReturnValue(mockResult);

      const response = await request(app).get('/api/epoch/150/rewards').expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(1000);
      expect(response.body.hasMore).toBe(true);
      expect(mockDbGetEpochRewards).toHaveBeenCalledWith(150, expect.objectContaining({ limit: 50, offset: 0 }));
    });

    it('should support pagination', async () => {
      mockDbGetEpochRewards.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app).get('/api/epoch/150/rewards?limit=25&offset=100').expect(200);

      expect(mockDbGetEpochRewards).toHaveBeenCalledWith(150, expect.objectContaining({ limit: 25, offset: 100 }));
    });

    it('should support type filter', async () => {
      mockDbGetEpochRewards.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app).get('/api/epoch/150/rewards?type=validation').expect(200);

      expect(mockDbGetEpochRewards).toHaveBeenCalledWith(150, expect.objectContaining({ type: 'validation' }));
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app).get('/api/epoch/invalid/rewards').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 400 for negative epoch', async () => {
      const response = await request(app).get('/api/epoch/-1/rewards').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/rewards').expect(503);

      historyDB.enabled = true;
    });
  });

  describe('GET /api/epoch/:epoch/rewards/summary', () => {
    it('should return rewards summary by type', async () => {
      const mockSummary = {
        validation: { count: 500, total: '50000.0' },
        flip: { count: 300, total: '7500.0' },
        invite: { count: 100, total: '1000.0' },
      };
      mockDbGetEpochRewardsSummary.mockReturnValue(mockSummary);

      const response = await request(app).get('/api/epoch/150/rewards/summary').expect(200);

      expect(response.body.result.validation.count).toBe(500);
      expect(response.body.result.flip.total).toBe('7500.0');
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app).get('/api/epoch/invalid/rewards/summary').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 404 when no reward data exists', async () => {
      mockDbGetEpochRewardsSummary.mockReturnValue(null);

      const response = await request(app).get('/api/epoch/999/rewards/summary').expect(404);

      expect(response.body.error.message).toContain('No reward data');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/rewards/summary').expect(503);

      historyDB.enabled = true;
    });
  });

  // ==========================================
  // Epoch Validation Endpoints Tests
  // ==========================================

  describe('GET /api/epoch/:epoch/validation', () => {
    it('should return validation summary for epoch', async () => {
      const mockSummary = {
        totalParticipants: 1000,
        passed: 850,
        failed: 100,
        missed: 50,
        avgShortScore: 0.95,
        avgLongScore: 0.92,
        totalFlipsMade: 2500,
        totalQualifiedFlips: 2300,
      };
      mockDbGetEpochValidationSummary.mockReturnValue(mockSummary);

      const response = await request(app).get('/api/epoch/150/validation').expect(200);

      expect(response.body.result.totalParticipants).toBe(1000);
      expect(response.body.result.passed).toBe(850);
      expect(response.body.result.avgShortScore).toBe(0.95);
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app).get('/api/epoch/invalid/validation').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 400 for negative epoch', async () => {
      const response = await request(app).get('/api/epoch/-1/validation').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 404 when no validation data exists', async () => {
      mockDbGetEpochValidationSummary.mockReturnValue(null);

      const response = await request(app).get('/api/epoch/999/validation').expect(404);

      expect(response.body.error.message).toContain('No validation data');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/validation').expect(503);

      historyDB.enabled = true;
    });
  });

  // ==========================================
  // Epoch Penalties Endpoints Tests
  // ==========================================

  describe('GET /api/epoch/:epoch/penalties', () => {
    it('should return paginated penalties list', async () => {
      const mockResult = {
        data: [
          { address: '0xaddr1', penalty: '100', reason: 'bad_flip', blockHeight: 1000, timestamp: 1704067200 },
          { address: '0xaddr2', penalty: '50', reason: 'missed_validation', blockHeight: 1001, timestamp: 1704067200 },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockDbGetEpochPenalties.mockReturnValue(mockResult);

      const response = await request(app).get('/api/epoch/150/penalties').expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(50);
      expect(mockDbGetEpochPenalties).toHaveBeenCalledWith(150, expect.objectContaining({ limit: 50, offset: 0 }));
    });

    it('should support pagination', async () => {
      mockDbGetEpochPenalties.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app).get('/api/epoch/150/penalties?limit=25&offset=50').expect(200);

      expect(mockDbGetEpochPenalties).toHaveBeenCalledWith(150, expect.objectContaining({ limit: 25, offset: 50 }));
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app).get('/api/epoch/invalid/penalties').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 400 for negative epoch', async () => {
      const response = await request(app).get('/api/epoch/-1/penalties').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/penalties').expect(503);

      historyDB.enabled = true;
    });
  });

  describe('GET /api/epoch/:epoch/penalties/summary', () => {
    it('should return penalties summary', async () => {
      const mockSummary = {
        epoch: 150,
        totalPenalties: 100,
        uniqueAddresses: 80,
        totalAmount: '5000.0',
        byReason: {
          bad_flip: { count: 60, total: '3000.0' },
          missed_validation: { count: 40, total: '2000.0' },
        },
      };
      mockDbGetEpochPenaltySummary.mockReturnValue(mockSummary);

      const response = await request(app).get('/api/epoch/150/penalties/summary').expect(200);

      expect(response.body.result.totalPenalties).toBe(100);
      expect(response.body.result.byReason.bad_flip.count).toBe(60);
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app).get('/api/epoch/invalid/penalties/summary').expect(400);

      expect(response.body.error.message).toBe('Invalid epoch number');
    });

    it('should return 404 when no penalty data exists', async () => {
      mockDbGetEpochPenaltySummary.mockReturnValue(null);

      const response = await request(app).get('/api/epoch/999/penalties/summary').expect(404);

      expect(response.body.error.message).toContain('No penalty data');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app).get('/api/epoch/150/penalties/summary').expect(503);

      historyDB.enabled = true;
    });
  });
});
