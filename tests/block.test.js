// Create mock functions that will be reused
const mockGetBlockByHeight = jest.fn();
const mockGetBlockByHash = jest.fn();

// Mock the RPC module BEFORE any imports
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getBlockByHeight: mockGetBlockByHeight,
    getBlockByHash: mockGetBlockByHash,
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Block Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/block/:heightOrHash', () => {
    const validHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const validHeight = 12345;

    const mockBlockData = {
      height: 12345,
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      parentHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      timestamp: 1704067200,
      root: '0x1111111111111111111111111111111111111111111111111111111111111111',
      identityRoot: '0x2222222222222222222222222222222222222222222222222222222222222222',
      proposer: '0x1234567890123456789012345678901234567890',
      transactions: ['0xaaa...', '0xbbb...'],
    };

    it('should return block for valid height', async () => {
      mockGetBlockByHeight.mockResolvedValueOnce(mockBlockData);

      const response = await request(app)
        .get('/api/block/' + validHeight)
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('height', 12345);
      expect(response.body.result).toHaveProperty('hash');
      expect(mockGetBlockByHeight).toHaveBeenCalledWith(validHeight);
    });

    it('should return block for valid hash', async () => {
      mockGetBlockByHash.mockResolvedValueOnce(mockBlockData);

      const response = await request(app)
        .get('/api/block/' + validHash)
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('hash', validHash);
      expect(mockGetBlockByHash).toHaveBeenCalledWith(validHash);
    });

    it('should return block for height 0 (genesis block)', async () => {
      const genesisBlock = { ...mockBlockData, height: 0 };
      mockGetBlockByHeight.mockResolvedValueOnce(genesisBlock);

      const response = await request(app).get('/api/block/0').expect(200);

      expect(response.body.result).toHaveProperty('height', 0);
      expect(mockGetBlockByHeight).toHaveBeenCalledWith(0);
    });

    it('should reject invalid identifier - not a number or hash', async () => {
      const response = await request(app).get('/api/block/invalid').expect(400);

      expect(response.body.error.message).toContain('Invalid block identifier');
    });

    it('should reject invalid hash format - too short', async () => {
      const response = await request(app).get('/api/block/0x1234').expect(400);

      expect(response.body.error.message).toContain('Invalid block identifier');
    });

    it('should reject invalid hash format - invalid characters', async () => {
      const invalidHash = '0xZZZZ567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(app)
        .get('/api/block/' + invalidHash)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid block identifier');
    });

    it('should return 404 when block not found by height', async () => {
      mockGetBlockByHeight.mockResolvedValueOnce(null);

      const response = await request(app).get('/api/block/999999999').expect(404);

      expect(response.body.error.message).toBe('Block not found');
    });

    it('should return 404 when block not found by hash', async () => {
      mockGetBlockByHash.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/block/' + validHash)
        .expect(404);

      expect(response.body.error.message).toBe('Block not found');
    });

    it('should handle RPC errors gracefully', async () => {
      mockGetBlockByHeight.mockRejectedValueOnce(new Error('RPC connection failed'));

      const response = await request(app)
        .get('/api/block/' + validHeight)
        .expect(500);

      expect(response.body.error.message).toContain('RPC connection failed');
    });
  });
});
