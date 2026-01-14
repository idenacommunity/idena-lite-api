/**
 * Tests for Background Sync Service (sync.js)
 */

// Mock the database module
const mockGetSyncStatus = jest.fn();
const mockUpdateSyncStatus = jest.fn();
const mockSetSyncStartBlock = jest.fn();
const mockInsertBatch = jest.fn();
const mockInit = jest.fn();
const mockGetStats = jest.fn();
const mockGetLastEpoch = jest.fn();
const mockGetEpoch = jest.fn();
const mockInsertEpoch = jest.fn();
const mockCloseEpoch = jest.fn();
const mockInsertIdentityStatesBatch = jest.fn();
const mockInsertAddressStatesBatch = jest.fn();

jest.mock('../src/db', () => ({
  enabled: true,
  init: mockInit,
  getSyncStatus: mockGetSyncStatus,
  updateSyncStatus: mockUpdateSyncStatus,
  setSyncStartBlock: mockSetSyncStartBlock,
  insertBatch: mockInsertBatch,
  getStats: mockGetStats,
  getLastEpoch: mockGetLastEpoch,
  getEpoch: mockGetEpoch,
  insertEpoch: mockInsertEpoch,
  closeEpoch: mockCloseEpoch,
  insertIdentityStatesBatch: mockInsertIdentityStatesBatch,
  insertAddressStatesBatch: mockInsertAddressStatesBatch,
}));

// Mock the RPC module
const mockRpcCall = jest.fn();

jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    call: mockRpcCall,
  }));
});

// Import after mocks
const SyncService = require('../src/sync').constructor;

describe('SyncService', () => {
  let syncService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset environment
    process.env.HISTORY_ENABLED = 'true';
    process.env.SYNC_BATCH_SIZE = '10';
    process.env.SYNC_INTERVAL = '100';
    process.env.SYNC_CONCURRENCY = '5';

    // Create fresh instance
    syncService = new SyncService();
  });

  afterEach(() => {
    if (syncService.isRunning) {
      syncService.stop();
    }
  });

  describe('constructor', () => {
    it('should use default values when env vars not set', () => {
      delete process.env.SYNC_BATCH_SIZE;
      delete process.env.SYNC_INTERVAL;
      delete process.env.SYNC_CONCURRENCY;

      const service = new SyncService();
      expect(service.batchSize).toBe(500);
      expect(service.syncInterval).toBe(1000);
      expect(service.concurrency).toBe(20);
    });

    it('should use environment variables when set', () => {
      process.env.SYNC_BATCH_SIZE = '100';
      process.env.SYNC_INTERVAL = '2000';
      process.env.SYNC_CONCURRENCY = '10';

      const service = new SyncService();
      expect(service.batchSize).toBe(100);
      expect(service.syncInterval).toBe(2000);
      expect(service.concurrency).toBe(10);
    });

    it('should be disabled when HISTORY_ENABLED is false', () => {
      process.env.HISTORY_ENABLED = 'false';
      const service = new SyncService();
      expect(service.enabled).toBe(false);
    });
  });

  describe('start()', () => {
    it('should not start when disabled', async () => {
      syncService.enabled = false;
      await syncService.start();
      expect(syncService.isRunning).toBe(false);
      expect(mockInit).not.toHaveBeenCalled();
    });

    it('should not start if already running', async () => {
      syncService.isRunning = true;
      await syncService.start();
      expect(mockInit).not.toHaveBeenCalled();
    });

    it('should initialize database on start', async () => {
      mockGetSyncStatus.mockReturnValue(null);

      // Start and immediately stop to prevent infinite loop
      const startPromise = syncService.start();
      await new Promise(resolve => setTimeout(resolve, 50));
      syncService.stop();

      expect(mockInit).toHaveBeenCalled();
      expect(syncService.isRunning).toBe(false); // stopped
    });
  });

  describe('stop()', () => {
    it('should set shouldStop to true', () => {
      syncService.isRunning = true;
      syncService.stop();
      expect(syncService.shouldStop).toBe(true);
      expect(syncService.isRunning).toBe(false);
    });
  });

  describe('_fetchBlock()', () => {
    it('should fetch and format block data', async () => {
      mockRpcCall.mockResolvedValue({
        height: 1000,
        hash: '0xhash',
        timestamp: 1704067200,
        epoch: 150,
        coinbase: '0xproposer',
        transactions: ['0xtx1', '0xtx2'],
      });

      const block = await syncService._fetchBlock(1000);

      expect(block).toEqual({
        height: 1000,
        hash: '0xhash',
        timestamp: 1704067200,
        epoch: 150,
        proposer: '0xproposer',
        txCount: 2,
        transactions: ['0xtx1', '0xtx2'],
      });
    });

    it('should return null when block not found', async () => {
      mockRpcCall.mockResolvedValue(null);
      const block = await syncService._fetchBlock(999999);
      expect(block).toBeNull();
    });

    it('should return null on RPC error', async () => {
      mockRpcCall.mockRejectedValue(new Error('RPC error'));
      const block = await syncService._fetchBlock(1000);
      expect(block).toBeNull();
    });

    it('should handle missing epoch', async () => {
      mockRpcCall.mockResolvedValue({
        height: 1000,
        hash: '0xhash',
        timestamp: 1000,
      });

      const block = await syncService._fetchBlock(1000);
      expect(block.epoch).toBe(0);
    });
  });

  describe('_fetchTransaction()', () => {
    it('should fetch and format transaction data', async () => {
      mockRpcCall.mockResolvedValue({
        hash: '0xtxhash',
        type: 'send',
        from: '0xfrom',
        to: '0xto',
        amount: '100',
        maxFee: '0.01',
        nonce: 42,
      });

      const tx = await syncService._fetchTransaction('0xtxhash', 1000, 1704067200, 0);

      expect(tx).toEqual({
        hash: '0xtxhash',
        blockHeight: 1000,
        txIndex: 0,
        type: 'send',
        from: '0xfrom',
        to: '0xto',
        amount: '100',
        fee: '0.01',
        nonce: 42,
        timestamp: 1704067200,
      });
    });

    it('should return minimal data when tx not available (fast sync)', async () => {
      mockRpcCall.mockResolvedValue(null);

      const tx = await syncService._fetchTransaction('0xtxhash', 1000, 1704067200, 5);

      expect(tx).toEqual({
        hash: '0xtxhash',
        blockHeight: 1000,
        txIndex: 5,
        type: 'unknown',
        from: '0x0000000000000000000000000000000000000000',
        to: null,
        amount: '0',
        fee: '0',
        nonce: null,
        timestamp: 1704067200,
      });
    });

    it('should return null on RPC error', async () => {
      mockRpcCall.mockRejectedValue(new Error('RPC error'));
      const tx = await syncService._fetchTransaction('0xtxhash', 1000, 1000, 0);
      expect(tx).toBeNull();
    });

    it('should use fee when maxFee not available', async () => {
      mockRpcCall.mockResolvedValue({
        hash: '0xtxhash',
        type: 'send',
        from: '0xfrom',
        fee: '0.05',
      });

      const tx = await syncService._fetchTransaction('0xtxhash', 1000, 1000, 0);
      expect(tx.fee).toBe('0.05');
    });
  });

  describe('_syncBatch()', () => {
    beforeEach(() => {
      mockGetSyncStatus.mockReturnValue({
        lastSyncedBlock: 1000,
        syncStartBlock: 1000,
      });
    });

    it('should skip when sync status is null', async () => {
      mockGetSyncStatus.mockReturnValue(null);
      await syncService._syncBatch();
      expect(mockRpcCall).not.toHaveBeenCalled();
    });

    it('should get chain height from bcn_syncing', async () => {
      mockRpcCall.mockImplementation((method) => {
        if (method === 'bcn_syncing') {
          return { currentBlock: 2000, highestBlock: 2000 };
        }
        return null;
      });

      await syncService._syncBatch();
      expect(mockRpcCall).toHaveBeenCalledWith('bcn_syncing', []);
    });

    it('should fallback to bcn_lastBlock if bcn_syncing fails', async () => {
      mockRpcCall.mockImplementation((method) => {
        if (method === 'bcn_syncing') {
          return { currentBlock: null };
        }
        if (method === 'bcn_lastBlock') {
          return { height: 2000 };
        }
        return null;
      });

      await syncService._syncBatch();
      expect(mockRpcCall).toHaveBeenCalledWith('bcn_lastBlock', []);
    });

    it('should skip when already synced', async () => {
      mockGetSyncStatus.mockReturnValue({
        lastSyncedBlock: 2000,
        syncStartBlock: 1000,
      });

      mockRpcCall.mockImplementation((method) => {
        if (method === 'bcn_syncing') {
          return { currentBlock: 2000 };
        }
        return null;
      });

      await syncService._syncBatch();
      expect(mockUpdateSyncStatus).toHaveBeenCalledWith(2000, 2000, false);
    });

    it('should insert blocks and transactions', async () => {
      mockRpcCall.mockImplementation((method, params) => {
        if (method === 'bcn_syncing') {
          return { currentBlock: 1005 };
        }
        if (method === 'bcn_blockAt') {
          return {
            height: params[0],
            hash: `0xhash${params[0]}`,
            timestamp: 1000 + params[0],
            epoch: 1,
            transactions: [],
          };
        }
        return null;
      });

      await syncService._syncBatch();
      expect(mockInsertBatch).toHaveBeenCalled();
    });

    it('should set sync start block on first sync', async () => {
      mockGetSyncStatus.mockReturnValue({
        lastSyncedBlock: 0,
        syncStartBlock: 0,
      });

      mockRpcCall.mockImplementation((method) => {
        if (method === 'bcn_syncing') {
          return { currentBlock: 5000 };
        }
        return null;
      });

      await syncService._syncBatch();
      expect(mockSetSyncStartBlock).toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('should return combined status', () => {
      mockGetSyncStatus.mockReturnValue({
        lastSyncedBlock: 5000,
        highestKnownBlock: 10000,
      });
      mockGetStats.mockReturnValue({
        enabled: true,
        blockCount: 5000,
        txCount: 10000,
      });

      syncService.isRunning = true;
      const status = syncService.getStatus();

      expect(status.enabled).toBe(true);
      expect(status.running).toBe(true);
      expect(status.lastSyncedBlock).toBe(5000);
      expect(status.database.blockCount).toBe(5000);
    });
  });

  describe('_sleep()', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await syncService._sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90);
    });
  });
});

// Export the SyncService class for testing
module.exports = { SyncService: require('../src/sync').constructor };
