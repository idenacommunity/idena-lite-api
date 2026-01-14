/**
 * Tests for Search Routes
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
  getStats: jest.fn().mockReturnValue({ enabled: true }),
  search: jest.fn(),
  searchAddresses: jest.fn(),
  searchTransactions: jest.fn(),
  searchBlocks: jest.fn(),
  getBlock: jest.fn(),
  getTransaction: jest.fn(),
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

describe('Search Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    historyDB.enabled = true;
  });

  describe('GET /api/search', () => {
    it('should search across all types', async () => {
      historyDB.search.mockReturnValue({
        addresses: [{ address: '0x1234567890abcdef' }],
        transactions: [],
        blocks: [],
        total: 1,
      });

      const response = await request(app)
        .get('/api/search?q=0x1234')
        .expect(200);

      expect(response.body.results.addresses).toHaveLength(1);
      expect(response.body.results.total).toBe(1);
      expect(response.body.query).toBe('0x1234');
    });

    it('should return 400 for short query', async () => {
      const response = await request(app)
        .get('/api/search?q=a')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_QUERY');
    });

    it('should return 400 for missing query', async () => {
      const response = await request(app)
        .get('/api/search')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_QUERY');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get('/api/search?q=0x1234')
        .expect(503);

      expect(response.body.error.code).toBe('SEARCH_UNAVAILABLE');
    });

    it('should respect limit parameter', async () => {
      historyDB.search.mockReturnValue({
        addresses: [],
        transactions: [],
        blocks: [],
        total: 0,
      });

      await request(app)
        .get('/api/search?q=0x1234&limit=5')
        .expect(200);

      expect(historyDB.search).toHaveBeenCalledWith('0x1234', { limit: 5 });
    });
  });

  describe('GET /api/search/addresses', () => {
    it('should search addresses by prefix', async () => {
      historyDB.searchAddresses.mockReturnValue([
        '0x1234567890abcdef1234567890abcdef12345678',
        '0x1234567890abcdef1234567890abcdef12345679',
      ]);

      const response = await request(app)
        .get('/api/search/addresses?prefix=0x1234')
        .expect(200);

      expect(response.body.addresses).toHaveLength(2);
      expect(response.body.count).toBe(2);
    });

    it('should return 400 for invalid prefix', async () => {
      const response = await request(app)
        .get('/api/search/addresses?prefix=invalid')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PREFIX');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get('/api/search/addresses?prefix=0x1234')
        .expect(503);

      expect(response.body.error.code).toBe('SEARCH_UNAVAILABLE');
    });
  });

  describe('GET /api/search/transactions', () => {
    it('should search transactions by hash prefix', async () => {
      historyDB.searchTransactions.mockReturnValue([
        { hash: '0xabcd1234', type: 'send', from: '0x1', to: '0x2' },
      ]);

      const response = await request(app)
        .get('/api/search/transactions?prefix=0xabcd')
        .expect(200);

      expect(response.body.transactions).toHaveLength(1);
      expect(response.body.transactions[0].hash).toBe('0xabcd1234');
    });

    it('should return 400 for invalid prefix', async () => {
      const response = await request(app)
        .get('/api/search/transactions?prefix=invalid')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PREFIX');
    });
  });

  describe('GET /api/search/blocks', () => {
    it('should search blocks by height prefix', async () => {
      historyDB.searchBlocks.mockReturnValue([
        { height: 1234, hash: '0xabc', epoch: 10 },
        { height: 12345, hash: '0xdef', epoch: 10 },
      ]);

      const response = await request(app)
        .get('/api/search/blocks?q=1234')
        .expect(200);

      expect(response.body.blocks).toHaveLength(2);
    });

    it('should search blocks by hash prefix', async () => {
      historyDB.searchBlocks.mockReturnValue([
        { height: 1000, hash: '0xabcdef', epoch: 10 },
      ]);

      const response = await request(app)
        .get('/api/search/blocks?q=0xabc')
        .expect(200);

      expect(response.body.blocks).toHaveLength(1);
    });

    it('should return 400 for empty query', async () => {
      const response = await request(app)
        .get('/api/search/blocks?q=')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_QUERY');
    });
  });
});
