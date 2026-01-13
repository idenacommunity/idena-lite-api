// Create mock functions
const mockGetEpoch = jest.fn();
const mockGetCeremonyIntervals = jest.fn();

// Mock RPC module
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getEpoch: mockGetEpoch,
    getCeremonyIntervals: mockGetCeremonyIntervals
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Epoch Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/epoch/current', () => {
    it('should return current epoch data', async () => {
      const mockEpochData = {
        epoch: 100,
        nextValidation: '2026-02-15T12:00:00Z',
        currentPeriod: 'None'
      };
      mockGetEpoch.mockResolvedValueOnce(mockEpochData);

      const response = await request(app)
        .get('/api/epoch/current')
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result.epoch).toBe(100);
      expect(mockGetEpoch).toHaveBeenCalled();
    });

    it('should return 500 when epoch data is null', async () => {
      mockGetEpoch.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/epoch/current')
        .expect(500);

      expect(response.body.error.message).toBe('Failed to fetch epoch data');
    });

    it('should handle RPC errors', async () => {
      mockGetEpoch.mockRejectedValueOnce(new Error('RPC failed'));

      await request(app)
        .get('/api/epoch/current')
        .expect(500);
    });
  });

  describe('GET /api/epoch/intervals', () => {
    it('should return ceremony intervals', async () => {
      const mockIntervals = {
        FlipLotteryDuration: 7200,
        ShortSessionDuration: 900,
        LongSessionDuration: 1800
      };
      mockGetCeremonyIntervals.mockResolvedValueOnce(mockIntervals);

      const response = await request(app)
        .get('/api/epoch/intervals')
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toMatchObject(mockIntervals);
      expect(mockGetCeremonyIntervals).toHaveBeenCalled();
    });

    it('should return 500 when intervals are null', async () => {
      mockGetCeremonyIntervals.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/epoch/intervals')
        .expect(500);

      expect(response.body.error.message).toBe('Failed to fetch ceremony intervals');
    });

    it('should handle RPC errors', async () => {
      mockGetCeremonyIntervals.mockRejectedValueOnce(new Error('RPC failed'));

      await request(app)
        .get('/api/epoch/intervals')
        .expect(500);
    });
  });
});
