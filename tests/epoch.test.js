// Create mock functions for RPC
const mockGetEpoch = jest.fn();
const mockGetCeremonyIntervals = jest.fn();

// Create mock functions for historyDB
const mockDbGetLastEpoch = jest.fn();
const mockDbGetEpoch = jest.fn();
const mockDbGetEpochs = jest.fn();
const mockDbGetEpochIdentities = jest.fn();
const mockDbGetEpochIdentitySummary = jest.fn();

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
});
