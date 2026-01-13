// Create mock functions that will be reused
const mockGetBalance = jest.fn();

// Mock the RPC module BEFORE any imports
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getBalance: mockGetBalance,
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Balance Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/balance/:address', () => {
    const validAddress = '0x1234567890123456789012345678901234567890';

    it('should return balance for valid address', async () => {
      const mockBalanceData = {
        balance: '1000.5',
        stake: '500.25',
      };
      mockGetBalance.mockResolvedValueOnce(mockBalanceData);

      const response = await request(app)
        .get('/api/balance/' + validAddress)
        .expect(200);

      expect(response.body).toHaveProperty('address', validAddress);
      expect(response.body).toHaveProperty('balance', '1000.5');
      expect(response.body).toHaveProperty('stake', '500.25');
      expect(response.body).toHaveProperty('unit', 'iDNA');
      expect(mockGetBalance).toHaveBeenCalledWith(validAddress);
    });

    it('should return 0 balance when balance is null', async () => {
      mockGetBalance.mockResolvedValueOnce({
        balance: null,
        stake: null,
      });

      const response = await request(app)
        .get('/api/balance/' + validAddress)
        .expect(200);

      expect(response.body.balance).toBe('0');
      expect(response.body.stake).toBe('0');
    });

    it('should reject invalid address format - too short', async () => {
      const response = await request(app).get('/api/balance/0x123').expect(400);

      expect(response.body.error.message).toContain('Invalid Idena address');
    });

    it('should reject invalid address format - missing 0x prefix', async () => {
      const response = await request(app)
        .get('/api/balance/1234567890123456789012345678901234567890')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid Idena address');
    });

    it('should return 404 when address not found', async () => {
      mockGetBalance.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/balance/' + validAddress)
        .expect(404);

      expect(response.body.error.message).toBe('Address not found');
    });

    it('should handle RPC errors gracefully', async () => {
      mockGetBalance.mockRejectedValueOnce(new Error('RPC connection failed'));

      const response = await request(app)
        .get('/api/balance/' + validAddress)
        .expect(500);

      expect(response.body.error.message).toContain('RPC connection failed');
    });
  });
});
