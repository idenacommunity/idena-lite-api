// Create mock functions that will be reused
const mockGetTransaction = jest.fn();

// Mock the RPC module BEFORE any imports
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getTransaction: mockGetTransaction,
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Transaction Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/transaction/:hash', () => {
    const validHash =
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    it('should return transaction for valid hash', async () => {
      const mockTxData = {
        hash: validHash,
        type: 'send',
        from: '0x1234567890123456789012345678901234567890',
        to: '0x0987654321098765432109876543210987654321',
        amount: '100.5',
        tips: '0.01',
        maxFee: '0.1',
        nonce: 42,
        epoch: 150,
        blockHash:
          '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        timestamp: 1704067200,
      };
      mockGetTransaction.mockResolvedValueOnce(mockTxData);

      const response = await request(app)
        .get('/api/transaction/' + validHash)
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('hash', validHash);
      expect(response.body.result).toHaveProperty('type', 'send');
      expect(response.body.result).toHaveProperty('amount', '100.5');
      expect(mockGetTransaction).toHaveBeenCalledWith(validHash);
    });

    it('should reject invalid hash format - too short', async () => {
      const response = await request(app)
        .get('/api/transaction/0x1234')
        .expect(400);

      expect(response.body.error.message).toContain(
        'Invalid transaction hash format'
      );
    });

    it('should reject invalid hash format - missing 0x prefix', async () => {
      const hashWithoutPrefix =
        '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(app)
        .get('/api/transaction/' + hashWithoutPrefix)
        .expect(400);

      expect(response.body.error.message).toContain(
        'Invalid transaction hash format'
      );
    });

    it('should reject invalid hash format - invalid characters', async () => {
      const invalidHash =
        '0xZZZZ567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(app)
        .get('/api/transaction/' + invalidHash)
        .expect(400);

      expect(response.body.error.message).toContain(
        'Invalid transaction hash format'
      );
    });

    it('should return 404 when transaction not found', async () => {
      mockGetTransaction.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/transaction/' + validHash)
        .expect(404);

      expect(response.body.error.message).toBe('Transaction not found');
    });

    it('should handle RPC errors gracefully', async () => {
      mockGetTransaction.mockRejectedValueOnce(
        new Error('RPC connection failed')
      );

      const response = await request(app)
        .get('/api/transaction/' + validHash)
        .expect(500);

      expect(response.body.error.message).toContain('RPC connection failed');
    });
  });
});
