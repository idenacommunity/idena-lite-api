/**
 * Tests for Stats Routes
 */

// Mock the RPC module
const mockCall = jest.fn();
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    call: mockCall,
  }));
});

// Mock the database module
jest.mock('../src/db', () => ({
  enabled: true,
  getStats: jest.fn().mockReturnValue({
    enabled: true,
    blockCount: 1000,
    txCount: 500,
    epochCount: 10,
  }),
  getEpoch: jest.fn(),
  getEpochInvitesSummary: jest.fn(),
  getEpochPenaltySummary: jest.fn(),
  init: jest.fn(),
}));

// Mock the sync service
jest.mock('../src/sync', () => ({
  getStatus: jest.fn().mockReturnValue({ enabled: true }),
  start: jest.fn(),
  stop: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const historyDB = require('../src/db');

describe('Stats Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    historyDB.enabled = true;
  });

  describe('GET /api/stats/online', () => {
    it('should return online identities count', async () => {
      mockCall.mockResolvedValue([
        { address: '0x1' },
        { address: '0x2' },
        { address: '0x3' },
      ]);

      const response = await request(app)
        .get('/api/stats/online')
        .expect(200);

      expect(response.body.result.online).toBe(3);
      expect(response.body.result.timestamp).toBeDefined();
    });

    it('should return 0 when no miners online', async () => {
      mockCall.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stats/online')
        .expect(200);

      expect(response.body.result.online).toBe(0);
    });

    it('should handle RPC errors gracefully', async () => {
      mockCall.mockRejectedValue(new Error('RPC error'));

      const response = await request(app)
        .get('/api/stats/online')
        .expect(500);

      expect(response.body.error.message).toContain('Failed to fetch');
    });
  });

  describe('GET /api/stats/coins', () => {
    it('should return coin supply statistics', async () => {
      mockCall
        .mockResolvedValueOnce({ totalSupply: '1000000', totalBurnt: '10000' })
        .mockResolvedValueOnce({ totalStaked: '500000' });

      const response = await request(app)
        .get('/api/stats/coins')
        .expect(200);

      expect(response.body.result.totalSupply).toBe('1000000');
      expect(response.body.result.staked).toBe('500000');
      expect(response.body.result.burnt).toBe('10000');
      expect(response.body.result.timestamp).toBeDefined();
    });

    it('should handle missing values', async () => {
      mockCall
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({});

      const response = await request(app)
        .get('/api/stats/coins')
        .expect(200);

      expect(response.body.result.totalSupply).toBe('0');
      expect(response.body.result.staked).toBe('0');
    });

    it('should handle RPC errors', async () => {
      mockCall.mockRejectedValue(new Error('RPC error'));

      const response = await request(app)
        .get('/api/stats/coins')
        .expect(500);

      expect(response.body.error.message).toContain('Failed to fetch');
    });
  });

  describe('GET /api/stats/identities', () => {
    it('should return identity statistics by state', async () => {
      mockCall.mockResolvedValue([
        { address: '0x1', state: 'Human' },
        { address: '0x2', state: 'Human' },
        { address: '0x3', state: 'Verified' },
        { address: '0x4', state: 'Newbie' },
      ]);

      const response = await request(app)
        .get('/api/stats/identities')
        .expect(200);

      expect(response.body.result.total).toBe(4);
      expect(response.body.result.byState.Human).toBe(2);
      expect(response.body.result.byState.Verified).toBe(1);
      expect(response.body.result.byState.Newbie).toBe(1);
    });

    it('should handle empty identities list', async () => {
      mockCall.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/stats/identities')
        .expect(200);

      expect(response.body.result.total).toBe(0);
      expect(response.body.result.byState).toEqual({});
    });

    it('should handle RPC errors', async () => {
      mockCall.mockRejectedValue(new Error('RPC error'));

      const response = await request(app)
        .get('/api/stats/identities')
        .expect(500);

      expect(response.body.error.message).toContain('Failed to fetch');
    });
  });

  describe('GET /api/stats/summary', () => {
    it('should return network summary', async () => {
      mockCall.mockResolvedValue({ epoch: 150 });

      const response = await request(app)
        .get('/api/stats/summary')
        .expect(200);

      expect(response.body.result.database).toBeDefined();
      expect(response.body.result.currentEpoch).toBe(150);
      expect(response.body.result.timestamp).toBeDefined();
    });

    it('should work even if RPC fails', async () => {
      mockCall.mockRejectedValue(new Error('RPC error'));

      const response = await request(app)
        .get('/api/stats/summary')
        .expect(200);

      expect(response.body.result.database).toBeDefined();
      expect(response.body.result.currentEpoch).toBeNull();
    });
  });

  describe('GET /api/stats/epoch/:epoch', () => {
    it('should return epoch statistics', async () => {
      historyDB.getEpoch.mockReturnValue({
        epoch: 150,
        startBlock: 1000,
        endBlock: 2000,
      });
      historyDB.getEpochInvitesSummary.mockReturnValue({
        totalInvites: 100,
        activated: 80,
      });
      historyDB.getEpochPenaltySummary.mockReturnValue({
        totalPenalties: 10,
      });

      const response = await request(app)
        .get('/api/stats/epoch/150')
        .expect(200);

      expect(response.body.result.epoch.epoch).toBe(150);
      expect(response.body.result.invites.totalInvites).toBe(100);
      expect(response.body.result.penalties.totalPenalties).toBe(10);
    });

    it('should return 400 for invalid epoch', async () => {
      const response = await request(app)
        .get('/api/stats/epoch/invalid')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch');
    });

    it('should return 404 when epoch not found', async () => {
      historyDB.getEpoch.mockReturnValue(null);

      const response = await request(app)
        .get('/api/stats/epoch/999')
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get('/api/stats/epoch/150')
        .expect(503);

      expect(response.body.error.message).toContain('not enabled');
    });
  });
});
