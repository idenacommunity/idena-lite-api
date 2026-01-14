// Mock the database module
const mockGetSyncStatus = jest.fn();
const mockGetAddressTransactions = jest.fn();
const mockGetBlock = jest.fn();
const mockGetTransaction = jest.fn();
const mockGetStats = jest.fn();
const mockGetIdentityEpochs = jest.fn();
const mockGetIdentityState = jest.fn();
const mockGetAddressStates = jest.fn();
const mockGetAddressState = jest.fn();
const mockGetIdentityRewards = jest.fn();
const mockGetIdentityRewardsAtEpoch = jest.fn();
const mockGetIdentityValidationHistory = jest.fn();
const mockGetValidationResult = jest.fn();

jest.mock('../src/db', () => ({
  enabled: true,
  getSyncStatus: mockGetSyncStatus,
  getAddressTransactions: mockGetAddressTransactions,
  getBlock: mockGetBlock,
  getTransaction: mockGetTransaction,
  getStats: mockGetStats,
  getIdentityEpochs: mockGetIdentityEpochs,
  getIdentityState: mockGetIdentityState,
  getAddressStates: mockGetAddressStates,
  getAddressState: mockGetAddressState,
  getIdentityRewards: mockGetIdentityRewards,
  getIdentityRewardsAtEpoch: mockGetIdentityRewardsAtEpoch,
  getIdentityValidationHistory: mockGetIdentityValidationHistory,
  getValidationResult: mockGetValidationResult,
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

  // ==========================================
  // Identity State History Tests
  // ==========================================

  describe('GET /api/history/identity/:address/epochs', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return identity history across epochs', async () => {
      const mockResult = {
        data: [
          { epoch: 150, state: 'Human', prevState: 'Verified', timestamp: 1704067200 },
          { epoch: 149, state: 'Verified', prevState: 'Newbie', timestamp: 1703962600 },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockGetIdentityEpochs.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/epochs`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(50);
      expect(mockGetIdentityEpochs).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetIdentityEpochs.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/history/identity/${validAddress}/epochs?limit=10&offset=20`)
        .expect(200);

      expect(mockGetIdentityEpochs).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/epochs')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/epochs`)
        .expect(503);
    });
  });

  describe('GET /api/history/identity/:address/state/:epoch', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return identity state at specific epoch', async () => {
      const mockState = {
        address: validAddress,
        epoch: 150,
        state: 'Human',
        prevState: 'Verified',
        blockHeight: 5000000,
        timestamp: 1704067200,
      };
      mockGetIdentityState.mockReturnValue(mockState);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/state/150`)
        .expect(200);

      expect(response.body.result.state).toBe('Human');
      expect(response.body.result.epoch).toBe(150);
      expect(mockGetIdentityState).toHaveBeenCalledWith(validAddress, 150);
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/state/150')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 400 for invalid epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/state/abc`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 400 for negative epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/state/-1`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 404 when identity state not found', async () => {
      mockGetIdentityState.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/state/999`)
        .expect(404);

      expect(response.body.error.message).toContain('Identity state not found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/state/150`)
        .expect(503);
    });
  });

  // ==========================================
  // Address State History Tests
  // ==========================================

  describe('GET /api/history/address/:address/states', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return address state history across epochs', async () => {
      const mockResult = {
        data: [
          { epoch: 150, balance: '1000.5', stake: '500.25', txCount: 100 },
          { epoch: 149, balance: '900.0', stake: '450.0', txCount: 95 },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockGetAddressStates.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/states`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].balance).toBe('1000.5');
      expect(mockGetAddressStates).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetAddressStates.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/history/address/${validAddress}/states?limit=25&offset=50`)
        .expect(200);

      expect(mockGetAddressStates).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 25, offset: 50 })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/address/invalid/states')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/address/${validAddress}/states`)
        .expect(503);
    });
  });

  describe('GET /api/history/address/:address/state/:epoch', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return address state at specific epoch', async () => {
      const mockState = {
        address: validAddress,
        epoch: 150,
        balance: '1000.5',
        stake: '500.25',
        txCount: 100,
      };
      mockGetAddressState.mockReturnValue(mockState);

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/state/150`)
        .expect(200);

      expect(response.body.result.balance).toBe('1000.5');
      expect(response.body.result.stake).toBe('500.25');
      expect(mockGetAddressState).toHaveBeenCalledWith(validAddress, 150);
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/address/invalid/state/150')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 400 for invalid epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/address/${validAddress}/state/abc`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 400 for negative epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/address/${validAddress}/state/-1`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 404 when address state not found', async () => {
      mockGetAddressState.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/history/address/${validAddress}/state/999`)
        .expect(404);

      expect(response.body.error.message).toContain('Address state not found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/address/${validAddress}/state/150`)
        .expect(503);
    });
  });

  // ==========================================
  // Identity Rewards History Tests
  // ==========================================

  describe('GET /api/history/identity/:address/rewards', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return identity rewards history', async () => {
      const mockResult = {
        data: [
          { epoch: 150, type: 'validation', amount: '100.5' },
          { epoch: 150, type: 'flip', amount: '25.0' },
          { epoch: 149, type: 'validation', amount: '95.0' },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockGetIdentityRewards.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/rewards`)
        .expect(200);

      expect(response.body.data.length).toBe(3);
      expect(response.body.total).toBe(50);
      expect(mockGetIdentityRewards).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetIdentityRewards.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/history/identity/${validAddress}/rewards?limit=10&offset=20`)
        .expect(200);

      expect(mockGetIdentityRewards).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should support type filter', async () => {
      mockGetIdentityRewards.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/history/identity/${validAddress}/rewards?type=validation`)
        .expect(200);

      expect(mockGetIdentityRewards).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ type: 'validation' })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/rewards')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/rewards`)
        .expect(503);
    });
  });

  describe('GET /api/history/identity/:address/rewards/:epoch', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return identity rewards at specific epoch', async () => {
      const mockResult = {
        data: [
          { type: 'validation', amount: '100.5' },
          { type: 'flip', amount: '25.0' },
          { type: 'invite', amount: '10.0' },
        ],
        total: '135.5',
      };
      mockGetIdentityRewardsAtEpoch.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/rewards/150`)
        .expect(200);

      expect(response.body.result.data.length).toBe(3);
      expect(response.body.result.total).toBe('135.5');
      expect(mockGetIdentityRewardsAtEpoch).toHaveBeenCalledWith(validAddress, 150);
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/rewards/150')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 400 for invalid epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/rewards/abc`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 400 for negative epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/rewards/-1`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 404 when no rewards found', async () => {
      mockGetIdentityRewardsAtEpoch.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/rewards/999`)
        .expect(404);

      expect(response.body.error.message).toContain('No rewards found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/rewards/150`)
        .expect(503);
    });
  });

  // ==========================================
  // Identity Validation History Tests
  // ==========================================

  describe('GET /api/history/identity/:address/validation', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return identity validation history', async () => {
      const mockResult = {
        data: [
          {
            epoch: 150,
            shortAnswers: 6,
            shortCorrect: 6,
            longAnswers: 24,
            longCorrect: 23,
            madeFlips: 3,
            qualifiedFlips: 3,
            totalReward: '135.5',
            missedValidation: 0,
          },
          {
            epoch: 149,
            shortAnswers: 6,
            shortCorrect: 5,
            longAnswers: 24,
            longCorrect: 22,
            madeFlips: 3,
            qualifiedFlips: 3,
            totalReward: '120.0',
            missedValidation: 0,
          },
        ],
        total: 50,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockGetIdentityValidationHistory.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/validation`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.data[0].shortCorrect).toBe(6);
      expect(mockGetIdentityValidationHistory).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetIdentityValidationHistory.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/history/identity/${validAddress}/validation?limit=10&offset=20`)
        .expect(200);

      expect(mockGetIdentityValidationHistory).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/validation')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/validation`)
        .expect(503);
    });
  });

  describe('GET /api/history/identity/:address/validation/:epoch', () => {
    const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

    it('should return validation result at specific epoch', async () => {
      const mockResult = {
        address: validAddress,
        epoch: 150,
        shortAnswers: 6,
        shortCorrect: 6,
        longAnswers: 24,
        longCorrect: 23,
        madeFlips: 3,
        qualifiedFlips: 3,
        totalReward: '135.5',
        missedValidation: 0,
      };
      mockGetValidationResult.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/validation/150`)
        .expect(200);

      expect(response.body.result.shortCorrect).toBe(6);
      expect(response.body.result.totalReward).toBe('135.5');
      expect(mockGetValidationResult).toHaveBeenCalledWith(validAddress, 150);
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/history/identity/invalid/validation/150')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 400 for invalid epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/validation/abc`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 400 for negative epoch number', async () => {
      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/validation/-1`)
        .expect(400);

      expect(response.body.error.message).toContain('Invalid epoch number');
    });

    it('should return 404 when validation result not found', async () => {
      mockGetValidationResult.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/history/identity/${validAddress}/validation/999`)
        .expect(404);

      expect(response.body.error.message).toContain('No validation data found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/history/identity/${validAddress}/validation/150`)
        .expect(503);
    });
  });
});
