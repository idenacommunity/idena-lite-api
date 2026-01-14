// Mock the database module
const mockGetSyncStatus = jest.fn();
const mockGetAddressTransactions = jest.fn();
const mockGetBlock = jest.fn();
const mockGetTransaction = jest.fn();
const mockGetStats = jest.fn();

jest.mock('../src/db', () => ({
  enabled: true,
  getSyncStatus: mockGetSyncStatus,
  getAddressTransactions: mockGetAddressTransactions,
  getBlock: mockGetBlock,
  getTransaction: mockGetTransaction,
  getStats: mockGetStats,
  init: jest.fn(),
}));

// Mock the sync service
const mockSyncGetStatus = jest.fn();

jest.mock('../src/sync', () => ({
  getStatus: mockSyncGetStatus,
  start: jest.fn(),
  stop: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const historyDB = require('../src/db');

describe('History Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    historyDB.enabled = true;
  });

  describe('GET /api/history/status', () => {
    it('should return sync status when enabled', async () => {
      const mockStatus = {
        enabled: true,
        running: true,
        lastSyncedBlock: 6000000,
        highestKnownBlock: 10000000,
        lastSyncTime: '2026-01-14T00:00:00.000Z',
        syncStartBlock: 5000000,
        isSyncing: true,
        progress: '20.00',
        database: {
          enabled: true,
          blockCount: 1000000,
          txCount: 500000,
          blockRange: { min: 5000000, max: 6000000 },
        },
      };

      mockSyncGetStatus.mockReturnValue(mockStatus);

      const response = await request(app)
        .get('/api/history/status')
        .expect(200);

      expect(response.body).toHaveProperty('enabled', true);
      expect(response.body).toHaveProperty('running', true);
      expect(response.body).toHaveProperty('lastSyncedBlock', 6000000);
      expect(response.body).toHaveProperty('progress', '20.00');
      expect(response.body).toHaveProperty('database');
      expect(mockSyncGetStatus).toHaveBeenCalled();
    });

    it('should return disabled status when history is disabled', async () => {
      mockSyncGetStatus.mockReturnValue({
        enabled: false,
        running: false,
      });

      const response = await request(app)
        .get('/api/history/status')
        .expect(200);

      expect(response.body).toHaveProperty('enabled', false);
    });
  });

  describe('GET /api/history/address/:address/transactions', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    const mockTransactions = {
      data: [
        {
          hash: '0xabc123',
          blockHeight: 6000000,
          epoch: 150,
          type: 'send',
          from: validAddress,
          to: '0xrecipient',
          amount: '100.5',
          fee: '0.01',
          timestamp: 1704067200,
        },
        {
          hash: '0xdef456',
          blockHeight: 5999999,
          epoch: 150,
          type: 'send',
          from: '0xsender',
          to: validAddress,
          amount: '50.25',
          fee: '0.01',
          timestamp: 1704067100,
        },
      ],
      total: 150,
      limit: 50,
      offset: 0,
      hasMore: true,
    };

    it('should return transaction history for valid address', async () => {
      mockGetAddressTransactions.mockReturnValue(mockTransactions);

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/transactions`)
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('total', 150);
      expect(response.body).toHaveProperty('hasMore', true);
      expect(mockGetAddressTransactions).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination with limit and offset', async () => {
      mockGetAddressTransactions.mockReturnValue({
        ...mockTransactions,
        offset: 50,
        hasMore: true,
      });

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/transactions?limit=25&offset=50`)
        .expect(200);

      expect(mockGetAddressTransactions).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 25, offset: 50 })
      );
    });

    it('should enforce maximum limit of 100', async () => {
      mockGetAddressTransactions.mockReturnValue(mockTransactions);

      await request(app)
        .get(`/api/history/address/${validAddress}/transactions?limit=500`)
        .expect(200);

      expect(mockGetAddressTransactions).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 100 })
      );
    });

    it('should support filtering by transaction type', async () => {
      mockGetAddressTransactions.mockReturnValue(mockTransactions);

      await request(app)
        .get(`/api/history/address/${validAddress}/transactions?type=send`)
        .expect(200);

      expect(mockGetAddressTransactions).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ type: 'send' })
      );
    });

    it('should return 400 for invalid address format', async () => {
      const response = await request(app)
        .get('/api/history/address/invalid/transactions')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 400 for address with wrong length', async () => {
      const response = await request(app)
        .get('/api/history/address/0x1234/transactions')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history database is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/transactions`)
        .expect(503);

      expect(response.body.error.message).toContain('Historical database not enabled');
    });

    it('should return 503 when database returns error', async () => {
      mockGetAddressTransactions.mockReturnValue({
        data: [],
        total: 0,
        hasMore: false,
        error: 'Database connection failed',
      });

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/transactions`)
        .expect(503);

      expect(response.body.error.message).toContain('Database connection failed');
    });

    it('should return empty array when no transactions found', async () => {
      mockGetAddressTransactions.mockReturnValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
        hasMore: false,
      });

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/transactions`)
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });
  });

  describe('GET /api/history/block/:height', () => {
    const mockBlock = {
      height: 6000000,
      hash: '0xblockhash123',
      timestamp: 1704067200,
      epoch: 150,
      proposer: '0xproposer123',
      txCount: 5,
    };

    it('should return block for valid height', async () => {
      mockGetBlock.mockReturnValue(mockBlock);

      const response = await request(app)
        .get('/api/history/block/6000000')
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('height', 6000000);
      expect(response.body.result).toHaveProperty('hash', '0xblockhash123');
      expect(mockGetBlock).toHaveBeenCalledWith(6000000);
    });

    it('should return block for height 0', async () => {
      const genesisBlock = { ...mockBlock, height: 0 };
      mockGetBlock.mockReturnValue(genesisBlock);

      const response = await request(app)
        .get('/api/history/block/0')
        .expect(200);

      expect(response.body.result.height).toBe(0);
    });

    it('should return 400 for invalid height (negative)', async () => {
      const response = await request(app)
        .get('/api/history/block/-1')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid block height');
    });

    it('should return 400 for invalid height (non-numeric)', async () => {
      const response = await request(app)
        .get('/api/history/block/abc')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid block height');
    });

    it('should return 404 when block not found', async () => {
      mockGetBlock.mockReturnValue(null);

      const response = await request(app)
        .get('/api/history/block/999999999')
        .expect(404);

      expect(response.body.error.message).toContain('Block not found');
      expect(response.body.error.message).toContain('may not be synced yet');
    });

    it('should return 503 when history database is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get('/api/history/block/6000000')
        .expect(503);

      expect(response.body.error.message).toContain('Historical database not enabled');
    });
  });

  describe('GET /api/history/transaction/:hash', () => {
    const validHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    const mockTransaction = {
      hash: validHash,
      blockHeight: 6000000,
      epoch: 150,
      type: 'send',
      from: '0xsender',
      to: '0xrecipient',
      amount: '100.5',
      fee: '0.01',
      nonce: 42,
      timestamp: 1704067200,
    };

    it('should return transaction for valid hash', async () => {
      mockGetTransaction.mockReturnValue(mockTransaction);

      const response = await request(app)
        .get(`/api/history/transaction/${validHash}`)
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(response.body.result).toHaveProperty('hash', validHash);
      expect(response.body.result).toHaveProperty('type', 'send');
      expect(response.body.result).toHaveProperty('amount', '100.5');
      expect(mockGetTransaction).toHaveBeenCalledWith(validHash);
    });

    it('should return 400 for invalid hash format (too short)', async () => {
      const response = await request(app)
        .get('/api/history/transaction/0x1234')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid transaction hash format');
    });

    it('should return 400 for invalid hash format (no 0x prefix)', async () => {
      const response = await request(app)
        .get('/api/history/transaction/1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid transaction hash format');
    });

    it('should return 400 for invalid hash format (invalid characters)', async () => {
      const invalidHash = '0xZZZZ567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      const response = await request(app)
        .get(`/api/history/transaction/${invalidHash}`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid transaction hash format');
    });

    it('should return 404 when transaction not found', async () => {
      mockGetTransaction.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/history/transaction/${validHash}`)
        .expect(404);

      expect(response.body.error.message).toContain('Transaction not found');
      expect(response.body.error.message).toContain('may not be synced yet');
    });

    it('should return 503 when history database is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get(`/api/history/transaction/${validHash}`)
        .expect(503);

      expect(response.body.error.message).toContain('Historical database not enabled');
    });
  });
});
