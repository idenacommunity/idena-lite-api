/**
 * Tests for SQLite Database Layer (db.js)
 */

const path = require('path');
const os = require('os');

// Use a temporary database for tests
const testDbPath = path.join(os.tmpdir(), `idena-test-${Date.now()}.db`);

// Set environment before requiring db module
process.env.SQLITE_PATH = testDbPath;
process.env.HISTORY_ENABLED = 'true';

// Create a fresh instance for testing

describe('HistoryDB', () => {
  let db;

  beforeEach(() => {
    // Create fresh instance for each test
    const tempPath = path.join(os.tmpdir(), `idena-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new (require('../src/db').constructor)(tempPath);
    db.enabled = true;
    db.init();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('init()', () => {
    it('should initialize database and create schema', () => {
      expect(db.db).not.toBeNull();
      expect(db.enabled).toBe(true);
    });

    it('should create blocks table', () => {
      const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='blocks'").get();
      expect(tables).toBeDefined();
      expect(tables.name).toBe('blocks');
    });

    it('should create transactions table', () => {
      const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transactions'").get();
      expect(tables).toBeDefined();
      expect(tables.name).toBe('transactions');
    });

    it('should create sync_status table with initial row', () => {
      const status = db.db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
      expect(status).toBeDefined();
      expect(status.last_synced_block).toBe(0);
    });

    it('should not initialize when disabled', () => {
      const disabledDb = new (require('../src/db').constructor)();
      disabledDb.enabled = false;
      disabledDb.init();
      expect(disabledDb.db).toBeNull();
    });
  });

  describe('insertBlock()', () => {
    it('should insert a block', () => {
      const block = {
        height: 1000,
        hash: '0xabc123',
        timestamp: 1704067200,
        epoch: 150,
        proposer: '0xproposer',
        txCount: 5,
      };

      db.insertBlock(block);

      const result = db.db.prepare('SELECT * FROM blocks WHERE height = ?').get(1000);
      expect(result.height).toBe(1000);
      expect(result.hash).toBe('0xabc123');
      expect(result.epoch).toBe(150);
      expect(result.tx_count).toBe(5);
    });

    it('should replace block on conflict', () => {
      const block1 = { height: 1000, hash: '0xfirst', timestamp: 1000, epoch: 1 };
      const block2 = { height: 1000, hash: '0xsecond', timestamp: 2000, epoch: 2 };

      db.insertBlock(block1);
      db.insertBlock(block2);

      const result = db.db.prepare('SELECT * FROM blocks WHERE height = ?').get(1000);
      expect(result.hash).toBe('0xsecond');
    });
  });

  describe('insertTransaction()', () => {
    it('should insert a transaction', () => {
      // First insert a block (foreign key)
      db.insertBlock({ height: 1000, hash: '0xblock', timestamp: 1000, epoch: 1 });

      const tx = {
        hash: '0xtx123',
        blockHeight: 1000,
        txIndex: 0,
        type: 'send',
        from: '0xsender',
        to: '0xrecipient',
        amount: '100.5',
        fee: '0.01',
        nonce: 42,
        timestamp: 1704067200,
      };

      db.insertTransaction(tx);

      const result = db.db.prepare('SELECT * FROM transactions WHERE hash = ?').get('0xtx123');
      expect(result.hash).toBe('0xtx123');
      expect(result.type).toBe('send');
      expect(result.from_addr).toBe('0xsender');
      expect(result.amount).toBe('100.5');
    });
  });

  describe('insertBatch()', () => {
    it('should insert multiple blocks and transactions', () => {
      const blocks = [
        { height: 1000, hash: '0xblock1', timestamp: 1000, epoch: 1, txCount: 1 },
        { height: 1001, hash: '0xblock2', timestamp: 1001, epoch: 1, txCount: 2 },
      ];

      const transactions = [
        { hash: '0xtx1', blockHeight: 1000, type: 'send', from: '0xa', to: '0xb', timestamp: 1000 },
        { hash: '0xtx2', blockHeight: 1001, type: 'send', from: '0xc', to: '0xd', timestamp: 1001 },
        { hash: '0xtx3', blockHeight: 1001, type: 'send', from: '0xe', to: '0xf', timestamp: 1001 },
      ];

      db.insertBatch(blocks, transactions);

      const blockCount = db.db.prepare('SELECT COUNT(*) as count FROM blocks').get().count;
      const txCount = db.db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;

      expect(blockCount).toBe(2);
      expect(txCount).toBe(3);
    });
  });

  describe('getBlock()', () => {
    it('should return block by height', () => {
      db.insertBlock({ height: 5000, hash: '0xhash', timestamp: 1000, epoch: 100, proposer: '0xp', txCount: 3 });

      const block = db.getBlock(5000);
      expect(block).not.toBeNull();
      expect(block.height).toBe(5000);
      expect(block.hash).toBe('0xhash');
      expect(block.txCount).toBe(3);
    });

    it('should return null for non-existent block', () => {
      const block = db.getBlock(999999);
      expect(block).toBeNull();
    });
  });

  describe('getTransaction()', () => {
    it('should return transaction by hash', () => {
      db.insertBlock({ height: 1000, hash: '0xblock', timestamp: 1000, epoch: 1 });
      db.insertTransaction({
        hash: '0xtxhash',
        blockHeight: 1000,
        type: 'send',
        from: '0xfrom',
        to: '0xto',
        amount: '50',
        fee: '0.1',
        nonce: 5,
        timestamp: 1000,
      });

      const tx = db.getTransaction('0xtxhash');
      expect(tx).not.toBeNull();
      expect(tx.hash).toBe('0xtxhash');
      expect(tx.type).toBe('send');
      expect(tx.epoch).toBe(1);
    });

    it('should return null for non-existent transaction', () => {
      const tx = db.getTransaction('0xnonexistent');
      expect(tx).toBeNull();
    });
  });

  describe('getAddressTransactions()', () => {
    beforeEach(() => {
      // Setup test data
      db.insertBlock({ height: 1000, hash: '0xb1', timestamp: 1000, epoch: 1 });
      db.insertBlock({ height: 1001, hash: '0xb2', timestamp: 1001, epoch: 1 });
      db.insertBlock({ height: 1002, hash: '0xb3', timestamp: 1002, epoch: 1 });

      db.insertTransaction({ hash: '0xt1', blockHeight: 1000, type: 'send', from: '0xAlice', to: '0xBob', timestamp: 1000 });
      db.insertTransaction({ hash: '0xt2', blockHeight: 1001, type: 'send', from: '0xBob', to: '0xAlice', timestamp: 1001 });
      db.insertTransaction({ hash: '0xt3', blockHeight: 1002, type: 'stake', from: '0xAlice', to: null, timestamp: 1002 });
    });

    it('should return transactions for address (case-insensitive)', () => {
      const result = db.getAddressTransactions('0xalice');
      expect(result.data.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should support pagination with limit and offset', () => {
      const page1 = db.getAddressTransactions('0xAlice', { limit: 2, offset: 0 });
      expect(page1.data.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const page2 = db.getAddressTransactions('0xAlice', { limit: 2, offset: 2 });
      expect(page2.data.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should filter by transaction type', () => {
      const result = db.getAddressTransactions('0xAlice', { type: 'stake' });
      expect(result.data.length).toBe(1);
      expect(result.data[0].type).toBe('stake');
    });

    it('should return empty for address with no transactions', () => {
      const result = db.getAddressTransactions('0xUnknown');
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getSyncStatus()', () => {
    it('should return initial sync status', () => {
      const status = db.getSyncStatus();
      expect(status.lastSyncedBlock).toBe(0);
      expect(status.isSyncing).toBe(false);
    });
  });

  describe('updateSyncStatus()', () => {
    it('should update last synced block', () => {
      db.updateSyncStatus(5000);
      const status = db.getSyncStatus();
      expect(status.lastSyncedBlock).toBe(5000);
    });

    it('should update highest known block', () => {
      db.updateSyncStatus(5000, 10000);
      const status = db.getSyncStatus();
      expect(status.highestKnownBlock).toBe(10000);
    });

    it('should update syncing state', () => {
      db.updateSyncStatus(5000, 10000, true);
      const status = db.getSyncStatus();
      expect(status.isSyncing).toBe(true);
    });

    it('should calculate progress', () => {
      db.setSyncStartBlock(1000);
      db.updateSyncStatus(5500, 10000);
      const status = db.getSyncStatus();
      expect(parseFloat(status.progress)).toBeCloseTo(50, 0);
    });
  });

  describe('setSyncStartBlock()', () => {
    it('should set sync start block', () => {
      db.setSyncStartBlock(5000000);
      const status = db.getSyncStatus();
      expect(status.syncStartBlock).toBe(5000000);
    });
  });

  describe('getStats()', () => {
    it('should return database statistics', () => {
      db.insertBlock({ height: 1000, hash: '0xb1', timestamp: 1000, epoch: 1 });
      db.insertBlock({ height: 1001, hash: '0xb2', timestamp: 1001, epoch: 1 });
      db.insertTransaction({ hash: '0xt1', blockHeight: 1000, type: 'send', from: '0xa', to: '0xb', timestamp: 1000 });

      const stats = db.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.blockCount).toBe(2);
      expect(stats.txCount).toBe(1);
      expect(stats.blockRange.min).toBe(1000);
      expect(stats.blockRange.max).toBe(1001);
    });

    it('should return disabled stats when db is disabled', () => {
      db.enabled = false;
      const stats = db.getStats();
      expect(stats.enabled).toBe(false);
    });
  });

  describe('close()', () => {
    it('should close database connection', () => {
      db.close();
      expect(db.db).toBeNull();
    });
  });

  describe('disabled database', () => {
    let disabledDb;

    beforeEach(() => {
      disabledDb = new (require('../src/db').constructor)();
      disabledDb.enabled = false;
    });

    it('should return null from getSyncStatus when disabled', () => {
      expect(disabledDb.getSyncStatus()).toBeNull();
    });

    it('should return null from getBlock when disabled', () => {
      expect(disabledDb.getBlock(1000)).toBeNull();
    });

    it('should return null from getTransaction when disabled', () => {
      expect(disabledDb.getTransaction('0xhash')).toBeNull();
    });

    it('should return error from getAddressTransactions when disabled', () => {
      const result = disabledDb.getAddressTransactions('0xaddr');
      expect(result.error).toBeDefined();
    });
  });

  // ==========================================
  // Epoch Methods Tests
  // ==========================================

  describe('Epoch Methods', () => {
    describe('insertEpoch()', () => {
      it('should insert a new epoch', () => {
        db.insertEpoch({
          epoch: 150,
          startBlock: 5000000,
          startTimestamp: 1704067200,
          endBlock: null,
          endTimestamp: null,
        });

        const epoch = db.getEpoch(150);
        expect(epoch).not.toBeNull();
        expect(epoch.epoch).toBe(150);
        expect(epoch.startBlock).toBe(5000000);
      });

      it('should replace epoch on conflict', () => {
        db.insertEpoch({ epoch: 150, startBlock: 1000, startTimestamp: 1000 });
        db.insertEpoch({ epoch: 150, startBlock: 2000, startTimestamp: 2000 });

        const epoch = db.getEpoch(150);
        expect(epoch.startBlock).toBe(2000);
      });
    });

    describe('closeEpoch()', () => {
      it('should update epoch end data', () => {
        db.insertEpoch({ epoch: 150, startBlock: 5000000, startTimestamp: 1704067200 });
        db.closeEpoch(150, 5100000, 1704167200, { validatedCount: 1000, blockCount: 100000 });

        const epoch = db.getEpoch(150);
        expect(epoch.endBlock).toBe(5100000);
        expect(epoch.endTimestamp).toBe(1704167200);
        expect(epoch.validatedCount).toBe(1000);
      });
    });

    describe('getEpoch()', () => {
      it('should return epoch by number', () => {
        db.insertEpoch({ epoch: 150, startBlock: 5000000, startTimestamp: 1704067200 });

        const epoch = db.getEpoch(150);
        expect(epoch).not.toBeNull();
        expect(epoch.epoch).toBe(150);
      });

      it('should return null for non-existent epoch', () => {
        const epoch = db.getEpoch(999);
        expect(epoch).toBeNull();
      });
    });

    describe('getLastEpoch()', () => {
      it('should return the most recent epoch', () => {
        db.insertEpoch({ epoch: 148, startBlock: 4800000, startTimestamp: 1703900000 });
        db.insertEpoch({ epoch: 149, startBlock: 4900000, startTimestamp: 1704000000 });
        db.insertEpoch({ epoch: 150, startBlock: 5000000, startTimestamp: 1704100000 });

        const epoch = db.getLastEpoch();
        expect(epoch.epoch).toBe(150);
      });

      it('should return null when no epochs exist', () => {
        const epoch = db.getLastEpoch();
        expect(epoch).toBeNull();
      });
    });

    describe('getEpochs()', () => {
      beforeEach(() => {
        for (let i = 145; i <= 150; i++) {
          db.insertEpoch({ epoch: i, startBlock: 4500000 + (i - 145) * 100000, startTimestamp: 1700000000 + (i - 145) * 100000 });
        }
      });

      it('should return paginated epochs', () => {
        const result = db.getEpochs({ limit: 3, offset: 0 });
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(6);
        expect(result.hasMore).toBe(true);
        expect(result.data[0].epoch).toBe(150); // Most recent first
      });

      it('should handle offset correctly', () => {
        const result = db.getEpochs({ limit: 3, offset: 3 });
        expect(result.data.length).toBe(3);
        expect(result.hasMore).toBe(false);
      });
    });

    describe('getEpochByBlock()', () => {
      beforeEach(() => {
        db.insertEpoch({ epoch: 149, startBlock: 4900000, startTimestamp: 1704000000, endBlock: 4999999, endTimestamp: 1704099999 });
        db.insertEpoch({ epoch: 150, startBlock: 5000000, startTimestamp: 1704100000 });
      });

      it('should return epoch containing block height', () => {
        const epoch = db.getEpochByBlock(4950000);
        expect(epoch.epoch).toBe(149);
      });

      it('should return current epoch for blocks in open epoch', () => {
        const epoch = db.getEpochByBlock(5050000);
        expect(epoch.epoch).toBe(150);
      });

      it('should return null for blocks before first epoch', () => {
        const epoch = db.getEpochByBlock(1000);
        expect(epoch).toBeNull();
      });
    });
  });

  // ==========================================
  // Identity State Methods Tests
  // ==========================================

  describe('Identity State Methods', () => {
    const testAddress = '0x1234567890123456789012345678901234567890';

    describe('insertIdentityState()', () => {
      it('should insert an identity state', () => {
        db.insertIdentityState({
          address: testAddress,
          epoch: 150,
          state: 'Human',
          prevState: 'Verified',
          blockHeight: 5000000,
          timestamp: 1704067200,
        });

        const state = db.getIdentityState(testAddress, 150);
        expect(state).not.toBeNull();
        expect(state.state).toBe('Human');
        expect(state.prevState).toBe('Verified');
      });
    });

    describe('insertIdentityStatesBatch()', () => {
      it('should insert multiple identity states', () => {
        const states = [
          { address: '0xaddr1', epoch: 150, state: 'Human', timestamp: 1704067200 },
          { address: '0xaddr2', epoch: 150, state: 'Verified', timestamp: 1704067200 },
          { address: '0xaddr3', epoch: 150, state: 'Newbie', timestamp: 1704067200 },
        ];

        db.insertIdentityStatesBatch(states);

        const count = db.db.prepare('SELECT COUNT(*) as count FROM identity_states').get().count;
        expect(count).toBe(3);
      });
    });

    describe('getIdentityState()', () => {
      it('should return identity state for address at epoch', () => {
        db.insertIdentityState({ address: testAddress, epoch: 150, state: 'Human', timestamp: 1704067200 });

        const state = db.getIdentityState(testAddress, 150);
        expect(state.state).toBe('Human');
      });

      it('should be case-insensitive for address', () => {
        db.insertIdentityState({ address: testAddress.toUpperCase(), epoch: 150, state: 'Human', timestamp: 1704067200 });

        const state = db.getIdentityState(testAddress.toLowerCase(), 150);
        expect(state).not.toBeNull();
      });

      it('should return null for non-existent state', () => {
        const state = db.getIdentityState(testAddress, 999);
        expect(state).toBeNull();
      });
    });

    describe('getIdentityEpochs()', () => {
      beforeEach(() => {
        for (let epoch = 145; epoch <= 150; epoch++) {
          db.insertEpoch({ epoch, startBlock: 4500000 + (epoch - 145) * 100000, startTimestamp: 1700000000 + (epoch - 145) * 100000 });
          db.insertIdentityState({
            address: testAddress,
            epoch,
            state: epoch < 148 ? 'Newbie' : epoch < 150 ? 'Verified' : 'Human',
            timestamp: 1700000000 + (epoch - 145) * 100000,
          });
        }
      });

      it('should return identity history across epochs', () => {
        const result = db.getIdentityEpochs(testAddress);
        expect(result.data.length).toBe(6);
        expect(result.total).toBe(6);
        expect(result.data[0].epoch).toBe(150); // Most recent first
        expect(result.data[0].state).toBe('Human');
      });

      it('should support pagination', () => {
        const result = db.getIdentityEpochs(testAddress, { limit: 3, offset: 0 });
        expect(result.data.length).toBe(3);
        expect(result.hasMore).toBe(true);
      });
    });

    describe('getEpochIdentities()', () => {
      beforeEach(() => {
        db.insertIdentityState({ address: '0xaddr1', epoch: 150, state: 'Human', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr2', epoch: 150, state: 'Human', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr3', epoch: 150, state: 'Verified', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr4', epoch: 150, state: 'Newbie', timestamp: 1704067200 });
      });

      it('should return all identities for an epoch', () => {
        const result = db.getEpochIdentities(150);
        expect(result.data.length).toBe(4);
        expect(result.total).toBe(4);
      });

      it('should filter by state', () => {
        const result = db.getEpochIdentities(150, { state: 'Human' });
        expect(result.data.length).toBe(2);
        expect(result.data.every(d => d.state === 'Human')).toBe(true);
      });

      it('should support pagination', () => {
        const result = db.getEpochIdentities(150, { limit: 2, offset: 0 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });
    });

    describe('getEpochIdentitySummary()', () => {
      beforeEach(() => {
        db.insertIdentityState({ address: '0xaddr1', epoch: 150, state: 'Human', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr2', epoch: 150, state: 'Human', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr3', epoch: 150, state: 'Verified', timestamp: 1704067200 });
        db.insertIdentityState({ address: '0xaddr4', epoch: 150, state: 'Newbie', timestamp: 1704067200 });
      });

      it('should return counts by state', () => {
        const summary = db.getEpochIdentitySummary(150);
        expect(summary.Human).toBe(2);
        expect(summary.Verified).toBe(1);
        expect(summary.Newbie).toBe(1);
      });

      it('should return null for non-existent epoch', () => {
        const summary = db.getEpochIdentitySummary(999);
        expect(Object.keys(summary).length).toBe(0);
      });
    });
  });

  // ==========================================
  // Address State Methods Tests
  // ==========================================

  describe('Address State Methods', () => {
    const testAddress = '0x1234567890123456789012345678901234567890';

    describe('insertAddressState()', () => {
      it('should insert an address state', () => {
        db.insertAddressState({
          address: testAddress,
          epoch: 150,
          balance: '1000.5',
          stake: '500.25',
          txCount: 42,
        });

        const state = db.getAddressState(testAddress, 150);
        expect(state).not.toBeNull();
        expect(state.balance).toBe('1000.5');
        expect(state.stake).toBe('500.25');
        expect(state.txCount).toBe(42);
      });
    });

    describe('insertAddressStatesBatch()', () => {
      it('should insert multiple address states', () => {
        const states = [
          { address: '0xaddr1', epoch: 150, balance: '100', stake: '50' },
          { address: '0xaddr2', epoch: 150, balance: '200', stake: '100' },
          { address: '0xaddr3', epoch: 150, balance: '300', stake: '150' },
        ];

        db.insertAddressStatesBatch(states);

        const count = db.db.prepare('SELECT COUNT(*) as count FROM address_states').get().count;
        expect(count).toBe(3);
      });
    });

    describe('getAddressState()', () => {
      it('should return address state for specific epoch', () => {
        db.insertAddressState({ address: testAddress, epoch: 150, balance: '1000', stake: '500' });

        const state = db.getAddressState(testAddress, 150);
        expect(state.balance).toBe('1000');
        expect(state.stake).toBe('500');
      });

      it('should be case-insensitive for address', () => {
        db.insertAddressState({ address: testAddress.toUpperCase(), epoch: 150, balance: '1000', stake: '500' });

        const state = db.getAddressState(testAddress.toLowerCase(), 150);
        expect(state).not.toBeNull();
      });

      it('should return null for non-existent state', () => {
        const state = db.getAddressState(testAddress, 999);
        expect(state).toBeNull();
      });
    });

    describe('getAddressStates()', () => {
      beforeEach(() => {
        for (let epoch = 145; epoch <= 150; epoch++) {
          db.insertEpoch({ epoch, startBlock: 4500000 + (epoch - 145) * 100000, startTimestamp: 1700000000 + (epoch - 145) * 100000 });
          db.insertAddressState({
            address: testAddress,
            epoch,
            balance: String((epoch - 144) * 100),
            stake: String((epoch - 144) * 50),
          });
        }
      });

      it('should return address state history across epochs', () => {
        const result = db.getAddressStates(testAddress);
        expect(result.data.length).toBe(6);
        expect(result.total).toBe(6);
        expect(result.data[0].epoch).toBe(150); // Most recent first
        expect(result.data[0].balance).toBe('600');
      });

      it('should support pagination', () => {
        const result = db.getAddressStates(testAddress, { limit: 3, offset: 0 });
        expect(result.data.length).toBe(3);
        expect(result.hasMore).toBe(true);
      });
    });
  });

  // ==========================================
  // Table Creation Tests for New Tables
  // ==========================================

  describe('New Table Schema', () => {
    it('should create epochs table', () => {
      const table = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epochs'").get();
      expect(table).toBeDefined();
      expect(table.name).toBe('epochs');
    });

    it('should create identity_states table', () => {
      const table = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='identity_states'").get();
      expect(table).toBeDefined();
      expect(table.name).toBe('identity_states');
    });

    it('should create address_states table', () => {
      const table = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='address_states'").get();
      expect(table).toBeDefined();
      expect(table.name).toBe('address_states');
    });
  });

  describe('getStats() with new tables', () => {
    it('should include epoch and identity counts', () => {
      db.insertEpoch({ epoch: 150, startBlock: 5000000, startTimestamp: 1704067200 });
      db.insertIdentityState({ address: '0xaddr1', epoch: 150, state: 'Human', timestamp: 1704067200 });
      db.insertIdentityState({ address: '0xaddr2', epoch: 150, state: 'Verified', timestamp: 1704067200 });

      const stats = db.getStats();
      expect(stats.epochCount).toBe(1);
      expect(stats.identityStateCount).toBe(2);
    });

    it('should include reward and validation counts', () => {
      db.insertReward('0xaddr1', 150, 'validation', '100.5');
      db.insertValidationResult({
        address: '0xaddr1',
        epoch: 150,
        shortAnswers: 6,
        shortCorrect: 5,
      });

      const stats = db.getStats();
      expect(stats.rewardCount).toBe(1);
      expect(stats.validationResultCount).toBe(1);
    });
  });

  // ==========================================
  // Rewards Methods Tests
  // ==========================================

  describe('Rewards Methods', () => {
    describe('insertReward()', () => {
      it('should insert a single reward', () => {
        db.insertReward('0xaddr1', 150, 'validation', '100.5');

        const rewards = db.getIdentityRewards('0xaddr1');
        expect(rewards.total).toBe(1);
        expect(rewards.data[0].type).toBe('validation');
        expect(rewards.data[0].amount).toBe('100.5');
      });

      it('should replace existing reward on conflict', () => {
        db.insertReward('0xaddr1', 150, 'validation', '100.5');
        db.insertReward('0xaddr1', 150, 'validation', '200.0');

        const rewards = db.getIdentityRewards('0xaddr1');
        expect(rewards.total).toBe(1);
        expect(rewards.data[0].amount).toBe('200.0');
      });
    });

    describe('insertRewardsBatch()', () => {
      it('should insert multiple rewards', () => {
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '50' },
          { address: '0xaddr1', epoch: 149, type: 'validation', amount: '90' },
        ]);

        const rewards = db.getIdentityRewards('0xaddr1');
        expect(rewards.total).toBe(3);
      });

      it('should handle empty array', () => {
        db.insertRewardsBatch([]);
        const stats = db.getStats();
        expect(stats.rewardCount).toBe(0);
      });
    });

    describe('getIdentityRewards()', () => {
      beforeEach(() => {
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '50' },
          { address: '0xaddr1', epoch: 149, type: 'validation', amount: '90' },
          { address: '0xaddr2', epoch: 150, type: 'validation', amount: '80' },
        ]);
      });

      it('should return rewards for address', () => {
        const rewards = db.getIdentityRewards('0xaddr1');
        expect(rewards.total).toBe(3);
        expect(rewards.data.length).toBe(3);
      });

      it('should support pagination', () => {
        const rewards = db.getIdentityRewards('0xaddr1', { limit: 2, offset: 0 });
        expect(rewards.data.length).toBe(2);
        expect(rewards.hasMore).toBe(true);
      });

      it('should filter by epoch', () => {
        const rewards = db.getIdentityRewards('0xaddr1', { epoch: 150 });
        expect(rewards.total).toBe(2);
      });

      it('should be case insensitive', () => {
        const rewards = db.getIdentityRewards('0xADDR1');
        expect(rewards.total).toBe(3);
      });
    });

    describe('getIdentityRewardsAtEpoch()', () => {
      beforeEach(() => {
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '50' },
          { address: '0xaddr1', epoch: 150, type: 'invite', amount: '25' },
        ]);
      });

      it('should return rewards breakdown for epoch', () => {
        const result = db.getIdentityRewardsAtEpoch('0xaddr1', 150);
        expect(result.epoch).toBe(150);
        expect(result.rewards.validation).toBe('100');
        expect(result.rewards.flip).toBe('50');
        expect(result.rewards.invite).toBe('25');
        expect(parseFloat(result.totalAmount)).toBe(175);
      });

      it('should return null when no rewards found', () => {
        const result = db.getIdentityRewardsAtEpoch('0xaddr1', 999);
        expect(result).toBeNull();
      });
    });

    describe('getEpochRewards()', () => {
      beforeEach(() => {
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '50' },
          { address: '0xaddr2', epoch: 150, type: 'validation', amount: '80' },
          { address: '0xaddr3', epoch: 150, type: 'validation', amount: '120' },
        ]);
      });

      it('should return rewards grouped by address', () => {
        const result = db.getEpochRewards(150);
        expect(result.total).toBe(3);
        // Should be ordered by total amount descending
        expect(result.data[0].address).toBe('0xaddr1'); // 150 total
        expect(parseFloat(result.data[0].totalAmount)).toBe(150);
      });

      it('should support pagination', () => {
        const result = db.getEpochRewards(150, { limit: 2, offset: 0 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });

      it('should filter by type', () => {
        const result = db.getEpochRewards(150, { type: 'validation' });
        expect(result.total).toBe(3);
      });
    });

    describe('getEpochRewardsSummary()', () => {
      beforeEach(() => {
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr2', epoch: 150, type: 'validation', amount: '80' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '50' },
          { address: '0xaddr3', epoch: 150, type: 'invite', amount: '25' },
        ]);
      });

      it('should return summary by type', () => {
        const summary = db.getEpochRewardsSummary(150);
        expect(summary.epoch).toBe(150);
        expect(summary.byType.validation.recipientCount).toBe(2);
        expect(parseFloat(summary.byType.validation.totalAmount)).toBe(180);
        expect(summary.byType.flip.recipientCount).toBe(1);
        expect(summary.totalRecipients).toBe(4);
        expect(parseFloat(summary.grandTotal)).toBe(255);
      });

      it('should return null when no data', () => {
        const summary = db.getEpochRewardsSummary(999);
        expect(summary).toBeNull();
      });
    });
  });

  // ==========================================
  // Validation Results Methods Tests
  // ==========================================

  describe('Validation Results Methods', () => {
    describe('insertValidationResult()', () => {
      it('should insert validation result', () => {
        db.insertValidationResult({
          address: '0xaddr1',
          epoch: 150,
          shortAnswers: 6,
          shortCorrect: 5,
          longAnswers: 20,
          longCorrect: 18,
          madeFlips: 3,
          qualifiedFlips: 3,
          totalReward: '100.5',
          missedValidation: false,
        });

        const result = db.getValidationResult('0xaddr1', 150);
        expect(result).not.toBeNull();
        expect(result.shortAnswers).toBe(6);
        expect(result.shortCorrect).toBe(5);
        expect(result.totalReward).toBe('100.5');
        expect(result.missedValidation).toBe(false);
      });

      it('should calculate scores correctly', () => {
        db.insertValidationResult({
          address: '0xaddr1',
          epoch: 150,
          shortAnswers: 6,
          shortCorrect: 5,
          longAnswers: 20,
          longCorrect: 18,
        });

        const result = db.getValidationResult('0xaddr1', 150);
        expect(result.shortScore).toBe('83.33');
        expect(result.longScore).toBe('90.00');
      });
    });

    describe('insertValidationResultsBatch()', () => {
      it('should insert multiple validation results', () => {
        db.insertValidationResultsBatch([
          { address: '0xaddr1', epoch: 150, shortAnswers: 6, shortCorrect: 5 },
          { address: '0xaddr2', epoch: 150, shortAnswers: 6, shortCorrect: 6 },
          { address: '0xaddr3', epoch: 150, shortAnswers: 6, shortCorrect: 4, missedValidation: true },
        ]);

        const stats = db.getStats();
        expect(stats.validationResultCount).toBe(3);
      });
    });

    describe('getValidationResult()', () => {
      beforeEach(() => {
        db.insertValidationResult({
          address: '0xaddr1',
          epoch: 150,
          shortAnswers: 6,
          shortCorrect: 5,
          longAnswers: 20,
          longCorrect: 18,
          madeFlips: 3,
          qualifiedFlips: 3,
          totalReward: '100.5',
          missedValidation: false,
        });
      });

      it('should return validation result', () => {
        const result = db.getValidationResult('0xaddr1', 150);
        expect(result).not.toBeNull();
        expect(result.address).toBe('0xaddr1');
        expect(result.epoch).toBe(150);
      });

      it('should be case insensitive', () => {
        const result = db.getValidationResult('0xADDR1', 150);
        expect(result).not.toBeNull();
      });

      it('should return null when not found', () => {
        const result = db.getValidationResult('0xaddr1', 999);
        expect(result).toBeNull();
      });
    });

    describe('getIdentityValidationHistory()', () => {
      beforeEach(() => {
        db.insertValidationResultsBatch([
          { address: '0xaddr1', epoch: 150, shortAnswers: 6, shortCorrect: 5 },
          { address: '0xaddr1', epoch: 149, shortAnswers: 6, shortCorrect: 6 },
          { address: '0xaddr1', epoch: 148, shortAnswers: 6, shortCorrect: 4 },
        ]);
      });

      it('should return validation history', () => {
        const history = db.getIdentityValidationHistory('0xaddr1');
        expect(history.total).toBe(3);
        expect(history.data.length).toBe(3);
        // Should be ordered by epoch descending
        expect(history.data[0].epoch).toBe(150);
      });

      it('should support pagination', () => {
        const history = db.getIdentityValidationHistory('0xaddr1', { limit: 2, offset: 0 });
        expect(history.data.length).toBe(2);
        expect(history.hasMore).toBe(true);
      });
    });

    describe('getEpochValidationSummary()', () => {
      beforeEach(() => {
        db.insertValidationResultsBatch([
          { address: '0xaddr1', epoch: 150, shortAnswers: 6, shortCorrect: 5, longAnswers: 20, longCorrect: 18, totalReward: '100', madeFlips: 3, qualifiedFlips: 3 },
          { address: '0xaddr2', epoch: 150, shortAnswers: 6, shortCorrect: 6, longAnswers: 20, longCorrect: 20, totalReward: '120', madeFlips: 3, qualifiedFlips: 3 },
          { address: '0xaddr3', epoch: 150, shortAnswers: 0, shortCorrect: 0, longAnswers: 0, longCorrect: 0, totalReward: '0', missedValidation: true },
        ]);
      });

      it('should return validation summary', () => {
        const summary = db.getEpochValidationSummary(150);
        expect(summary.epoch).toBe(150);
        expect(summary.totalParticipants).toBe(3);
        expect(summary.validatedCount).toBe(2);
        expect(summary.missedCount).toBe(1);
        expect(parseFloat(summary.totalRewards)).toBe(220);
        expect(summary.totalFlipsMade).toBe(6);
      });

      it('should calculate average scores', () => {
        const summary = db.getEpochValidationSummary(150);
        // Only 2 participants had short answers > 0
        expect(parseFloat(summary.avgShortScore)).toBeGreaterThan(80);
        expect(parseFloat(summary.avgLongScore)).toBeGreaterThan(90);
      });

      it('should return null when no data', () => {
        const summary = db.getEpochValidationSummary(999);
        expect(summary).toBeNull();
      });
    });
  });

  // ==========================================
  // Balance Changes Methods
  // ==========================================

  describe('Balance Changes Methods', () => {
    describe('insertBalanceChange()', () => {
      it('should insert a balance change', () => {
        db.insertBalanceChange({
          address: '0xaddr1',
          blockHeight: 1000,
          txHash: '0xtx1',
          changeType: 'tx_in',
          amount: '100.5',
          balanceAfter: '200.5',
          timestamp: 1704067200,
        });

        const stats = db.getStats();
        expect(stats.balanceChangeCount).toBe(1);
      });

      it('should allow null tx_hash for non-tx events', () => {
        db.insertBalanceChange({
          address: '0xaddr1',
          blockHeight: 1000,
          changeType: 'reward',
          amount: '50.0',
          balanceAfter: '150.0',
          timestamp: 1704067200,
        });

        const result = db.getAddressBalanceChanges('0xaddr1');
        expect(result.data[0].txHash).toBeNull();
      });
    });

    describe('insertBalanceChangesBatch()', () => {
      it('should insert multiple balance changes', () => {
        db.insertBalanceChangesBatch([
          { address: '0xaddr1', blockHeight: 1000, changeType: 'tx_in', amount: '100', timestamp: 1704067200 },
          { address: '0xaddr1', blockHeight: 1001, changeType: 'tx_out', amount: '50', timestamp: 1704067300 },
          { address: '0xaddr2', blockHeight: 1002, changeType: 'reward', amount: '10', timestamp: 1704067400 },
        ]);

        const stats = db.getStats();
        expect(stats.balanceChangeCount).toBe(3);
      });

      it('should handle empty array', () => {
        db.insertBalanceChangesBatch([]);
        const stats = db.getStats();
        expect(stats.balanceChangeCount).toBe(0);
      });
    });

    describe('getAddressBalanceChanges()', () => {
      beforeEach(() => {
        db.insertBalanceChangesBatch([
          { address: '0xaddr1', blockHeight: 1000, changeType: 'tx_in', amount: '100', balanceAfter: '100', timestamp: 1704067200 },
          { address: '0xaddr1', blockHeight: 1001, changeType: 'tx_out', amount: '30', balanceAfter: '70', timestamp: 1704067300 },
          { address: '0xaddr1', blockHeight: 1002, changeType: 'reward', amount: '10', balanceAfter: '80', timestamp: 1704067400 },
          { address: '0xaddr2', blockHeight: 1003, changeType: 'tx_in', amount: '200', timestamp: 1704067500 },
        ]);
      });

      it('should return balance changes for address', () => {
        const result = db.getAddressBalanceChanges('0xaddr1');
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(3);
      });

      it('should support pagination', () => {
        const result = db.getAddressBalanceChanges('0xaddr1', { limit: 2, offset: 0 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });

      it('should filter by change type', () => {
        const result = db.getAddressBalanceChanges('0xaddr1', { changeType: 'reward' });
        expect(result.data.length).toBe(1);
        expect(result.data[0].changeType).toBe('reward');
      });

      it('should be case insensitive', () => {
        const result = db.getAddressBalanceChanges('0xADDR1');
        expect(result.data.length).toBe(3);
      });

      it('should order by block height descending', () => {
        const result = db.getAddressBalanceChanges('0xaddr1');
        expect(result.data[0].blockHeight).toBe(1002);
        expect(result.data[2].blockHeight).toBe(1000);
      });
    });

    describe('getAddressInfo()', () => {
      beforeEach(() => {
        // Insert some address states
        db.insertAddressStatesBatch([
          { address: '0xaddr1', epoch: 150, balance: '1000', stake: '500', txCount: 10 },
          { address: '0xaddr1', epoch: 149, balance: '900', stake: '400', txCount: 8 },
        ]);

        // Insert identity states
        db.insertIdentityStatesBatch([
          { address: '0xaddr1', epoch: 150, state: 'Human', prevState: 'Verified', timestamp: 1704067200 },
        ]);

        // Insert blocks first (required for foreign key)
        db.insertBlock({
          height: 1000,
          hash: '0xblock1000',
          timestamp: 1704067200,
          epoch: 150,
          proposer: '0xproposer',
          txCount: 1,
        });
        db.insertBlock({
          height: 1001,
          hash: '0xblock1001',
          timestamp: 1704067300,
          epoch: 150,
          proposer: '0xproposer',
          txCount: 1,
        });

        // Insert some transactions
        db.insertTransaction({
          hash: '0xtx1',
          blockHeight: 1000,
          from: '0xaddr1',
          to: '0xaddr2',
          amount: '50',
          type: 'send',
          timestamp: 1704067200,
        });
        db.insertTransaction({
          hash: '0xtx2',
          blockHeight: 1001,
          from: '0xaddr2',
          to: '0xaddr1',
          amount: '30',
          type: 'send',
          timestamp: 1704067300,
        });

        // Insert rewards
        db.insertRewardsBatch([
          { address: '0xaddr1', epoch: 150, type: 'validation', amount: '100' },
          { address: '0xaddr1', epoch: 150, type: 'flip', amount: '25' },
        ]);

        // Insert penalties
        db.insertPenalty({
          address: '0xaddr1',
          epoch: 150,
          penalty: '10',
          reason: 'bad_flip',
          timestamp: 1704067200,
        });
      });

      it('should return full address info', () => {
        const info = db.getAddressInfo('0xaddr1');
        expect(info).not.toBeNull();
        expect(info.balance).toBe('1000');
        expect(info.stake).toBe('500');
        expect(info.epoch).toBe(150);
        expect(info.identityState).toBe('Human');
        expect(info.prevIdentityState).toBe('Verified');
        expect(info.txSent).toBe(1);
        expect(info.txReceived).toBe(1);
        expect(info.txTotal).toBe(2);
        expect(parseFloat(info.totalRewards)).toBe(125);
        expect(parseFloat(info.totalPenalties)).toBe(10);
      });

      it('should be case insensitive', () => {
        const info = db.getAddressInfo('0xADDR1');
        expect(info).not.toBeNull();
      });

      it('should return null for unknown address', () => {
        const info = db.getAddressInfo('0xunknown000000000000000000000000000000');
        expect(info).toBeNull();
      });
    });
  });

  // ==========================================
  // Penalties Methods
  // ==========================================

  describe('Penalties Methods', () => {
    describe('insertPenalty()', () => {
      it('should insert a penalty', () => {
        db.insertPenalty({
          address: '0xaddr1',
          epoch: 150,
          penalty: '50.5',
          reason: 'bad_flip',
          blockHeight: 1000,
          timestamp: 1704067200,
        });

        const stats = db.getStats();
        expect(stats.penaltyCount).toBe(1);
      });
    });

    describe('insertPenaltiesBatch()', () => {
      it('should insert multiple penalties', () => {
        db.insertPenaltiesBatch([
          { address: '0xaddr1', epoch: 150, penalty: '50', reason: 'bad_flip', timestamp: 1704067200 },
          { address: '0xaddr2', epoch: 150, penalty: '30', reason: 'missed_validation', timestamp: 1704067200 },
          { address: '0xaddr3', epoch: 150, penalty: '20', reason: 'bad_flip', timestamp: 1704067200 },
        ]);

        const stats = db.getStats();
        expect(stats.penaltyCount).toBe(3);
      });

      it('should handle empty array', () => {
        db.insertPenaltiesBatch([]);
        const stats = db.getStats();
        expect(stats.penaltyCount).toBe(0);
      });
    });

    describe('getAddressPenalties()', () => {
      beforeEach(() => {
        db.insertPenaltiesBatch([
          { address: '0xaddr1', epoch: 150, penalty: '50', reason: 'bad_flip', timestamp: 1704067200 },
          { address: '0xaddr1', epoch: 149, penalty: '30', reason: 'missed_validation', timestamp: 1704000000 },
          { address: '0xaddr2', epoch: 150, penalty: '20', reason: 'bad_flip', timestamp: 1704067200 },
        ]);
      });

      it('should return penalties for address', () => {
        const result = db.getAddressPenalties('0xaddr1');
        expect(result.data.length).toBe(2);
        expect(result.total).toBe(2);
      });

      it('should support pagination', () => {
        const result = db.getAddressPenalties('0xaddr1', { limit: 1 });
        expect(result.data.length).toBe(1);
        expect(result.hasMore).toBe(true);
      });

      it('should filter by epoch', () => {
        const result = db.getAddressPenalties('0xaddr1', { epoch: 150 });
        expect(result.data.length).toBe(1);
        expect(result.data[0].epoch).toBe(150);
      });

      it('should be case insensitive', () => {
        const result = db.getAddressPenalties('0xADDR1');
        expect(result.data.length).toBe(2);
      });

      it('should order by epoch descending', () => {
        const result = db.getAddressPenalties('0xaddr1');
        expect(result.data[0].epoch).toBe(150);
        expect(result.data[1].epoch).toBe(149);
      });
    });

    describe('getEpochPenalties()', () => {
      beforeEach(() => {
        db.insertPenaltiesBatch([
          { address: '0xaddr1', epoch: 150, penalty: '50', reason: 'bad_flip', timestamp: 1704067200 },
          { address: '0xaddr2', epoch: 150, penalty: '30', reason: 'missed_validation', timestamp: 1704067200 },
          { address: '0xaddr3', epoch: 150, penalty: '100', reason: 'bad_flip', timestamp: 1704067200 },
          { address: '0xaddr4', epoch: 149, penalty: '20', reason: 'bad_flip', timestamp: 1704000000 },
        ]);
      });

      it('should return penalties for epoch', () => {
        const result = db.getEpochPenalties(150);
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(3);
      });

      it('should support pagination', () => {
        const result = db.getEpochPenalties(150, { limit: 2 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });

      it('should order by penalty amount descending', () => {
        const result = db.getEpochPenalties(150);
        expect(result.data[0].penalty).toBe('100');
        expect(result.data[1].penalty).toBe('50');
      });

      it('should return empty for epoch with no penalties', () => {
        const result = db.getEpochPenalties(999);
        expect(result.data.length).toBe(0);
        expect(result.total).toBe(0);
      });
    });

    describe('getEpochPenaltySummary()', () => {
      beforeEach(() => {
        db.insertPenaltiesBatch([
          { address: '0xaddr1', epoch: 150, penalty: '50', reason: 'bad_flip', timestamp: 1704067200 },
          { address: '0xaddr2', epoch: 150, penalty: '30', reason: 'missed_validation', timestamp: 1704067200 },
          { address: '0xaddr3', epoch: 150, penalty: '100', reason: 'bad_flip', timestamp: 1704067200 },
        ]);
      });

      it('should return penalty summary', () => {
        const summary = db.getEpochPenaltySummary(150);
        expect(summary).not.toBeNull();
        expect(summary.epoch).toBe(150);
        expect(summary.totalPenalties).toBe(3);
        expect(summary.uniqueAddresses).toBe(3);
        expect(parseFloat(summary.totalAmount)).toBe(180);
      });

      it('should group by reason', () => {
        const summary = db.getEpochPenaltySummary(150);
        expect(summary.byReason.bad_flip.count).toBe(2);
        expect(parseFloat(summary.byReason.bad_flip.total)).toBe(150);
        expect(summary.byReason.missed_validation.count).toBe(1);
      });

      it('should return null when no data', () => {
        const summary = db.getEpochPenaltySummary(999);
        expect(summary).toBeNull();
      });
    });
  });

  describe('getStats() with Phase 3 tables', () => {
    it('should include balance change and penalty counts', () => {
      db.insertBalanceChange({
        address: '0xaddr1',
        blockHeight: 1000,
        changeType: 'tx_in',
        amount: '100',
        timestamp: 1704067200,
      });
      db.insertPenalty({
        address: '0xaddr1',
        epoch: 150,
        penalty: '50',
        reason: 'bad_flip',
        timestamp: 1704067200,
      });

      const stats = db.getStats();
      expect(stats.balanceChangeCount).toBe(1);
      expect(stats.penaltyCount).toBe(1);
    });
  });

  // ==========================================
  // Phase 4: Invite Methods Tests
  // ==========================================

  describe('Invite Methods', () => {
    const testInvite = {
      hash: '0xinvite1',
      inviter: '0xInviter1',
      invitee: null,
      epoch: 150,
      activationHash: null,
      activationTxHash: null,
      status: 'pending',
      blockHeight: 1000,
      timestamp: 1704067200,
    };

    describe('insertInvite()', () => {
      it('should insert an invite', () => {
        db.insertInvite(testInvite);
        const invite = db.getInvite('0xinvite1');
        expect(invite).toBeDefined();
        expect(invite.inviter.toLowerCase()).toBe('0xinviter1');
        expect(invite.status).toBe('pending');
      });

      it('should replace on duplicate hash', () => {
        db.insertInvite(testInvite);
        db.insertInvite({ ...testInvite, status: 'activated' });
        const invite = db.getInvite('0xinvite1');
        expect(invite.status).toBe('activated');
      });
    });

    describe('insertInvitesBatch()', () => {
      it('should insert multiple invites', () => {
        const invites = [
          { ...testInvite, hash: '0xinvite1' },
          { ...testInvite, hash: '0xinvite2', inviter: '0xInviter2' },
          { ...testInvite, hash: '0xinvite3', inviter: '0xInviter3' },
        ];
        db.insertInvitesBatch(invites);

        expect(db.getInvite('0xinvite1')).toBeDefined();
        expect(db.getInvite('0xinvite2')).toBeDefined();
        expect(db.getInvite('0xinvite3')).toBeDefined();
      });

      it('should handle empty array', () => {
        expect(() => db.insertInvitesBatch([])).not.toThrow();
      });
    });

    describe('updateInviteStatus()', () => {
      it('should update invite status', () => {
        db.insertInvite(testInvite);
        db.updateInviteStatus('0xinvite1', 'activated', '0xNewInvitee', '0xActivationTx');

        const invite = db.getInvite('0xinvite1');
        expect(invite.status).toBe('activated');
        expect(invite.invitee.toLowerCase()).toBe('0xnewinvitee');
        expect(invite.activationTxHash.toLowerCase()).toBe('0xactivationtx');
      });
    });

    describe('getInvite()', () => {
      it('should return invite by hash', () => {
        db.insertInvite(testInvite);
        const invite = db.getInvite('0xinvite1');
        expect(invite.hash).toBe('0xinvite1');
        expect(invite.epoch).toBe(150);
      });

      it('should return null for non-existent invite', () => {
        const invite = db.getInvite('0xnonexistent');
        expect(invite).toBeNull();
      });
    });

    describe('getAddressInvites()', () => {
      beforeEach(() => {
        // Insert test invites
        db.insertInvitesBatch([
          { ...testInvite, hash: '0xinvite1', inviter: '0xAddr1', invitee: null, status: 'pending' },
          { ...testInvite, hash: '0xinvite2', inviter: '0xAddr1', invitee: '0xAddr2', status: 'activated' },
          { ...testInvite, hash: '0xinvite3', inviter: '0xAddr3', invitee: '0xAddr1', status: 'activated' },
          { ...testInvite, hash: '0xinvite4', inviter: '0xAddr4', invitee: null, status: 'expired', epoch: 149 },
        ]);
      });

      it('should return all invites for an address', () => {
        const result = db.getAddressInvites('0xAddr1');
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(3);
      });

      it('should filter by type (sent)', () => {
        const result = db.getAddressInvites('0xAddr1', { type: 'sent' });
        expect(result.data.length).toBe(2);
        expect(result.data.every(i => i.inviter.toLowerCase() === '0xaddr1')).toBe(true);
      });

      it('should filter by type (received)', () => {
        const result = db.getAddressInvites('0xAddr1', { type: 'received' });
        expect(result.data.length).toBe(1);
        expect(result.data[0].invitee.toLowerCase()).toBe('0xaddr1');
      });

      it('should filter by status', () => {
        const result = db.getAddressInvites('0xAddr1', { status: 'activated' });
        expect(result.data.length).toBe(2);
      });

      it('should filter by epoch', () => {
        const result = db.getAddressInvites('0xAddr4', { epoch: 149 });
        expect(result.data.length).toBe(1);
        expect(result.data[0].epoch).toBe(149);
      });

      it('should support pagination', () => {
        const result = db.getAddressInvites('0xAddr1', { limit: 2, offset: 0 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });
    });

    describe('getAddressInvitesSent()', () => {
      it('should return only sent invites', () => {
        db.insertInvitesBatch([
          { ...testInvite, hash: '0xinvite1', inviter: '0xAddr1' },
          { ...testInvite, hash: '0xinvite2', inviter: '0xAddr1' },
          { ...testInvite, hash: '0xinvite3', inviter: '0xAddr2', invitee: '0xAddr1' },
        ]);

        const result = db.getAddressInvitesSent('0xAddr1');
        expect(result.data.length).toBe(2);
        expect(result.total).toBe(2);
      });
    });

    describe('getAddressInvitesReceived()', () => {
      it('should return only received invites', () => {
        db.insertInvitesBatch([
          { ...testInvite, hash: '0xinvite1', inviter: '0xAddr2', invitee: '0xAddr1' },
          { ...testInvite, hash: '0xinvite2', inviter: '0xAddr3', invitee: '0xAddr1' },
          { ...testInvite, hash: '0xinvite3', inviter: '0xAddr1', invitee: null },
        ]);

        const result = db.getAddressInvitesReceived('0xAddr1');
        expect(result.data.length).toBe(2);
        expect(result.total).toBe(2);
      });
    });

    describe('getEpochInvites()', () => {
      beforeEach(() => {
        db.insertInvitesBatch([
          { ...testInvite, hash: '0xinvite1', epoch: 150, status: 'pending' },
          { ...testInvite, hash: '0xinvite2', epoch: 150, status: 'activated' },
          { ...testInvite, hash: '0xinvite3', epoch: 150, status: 'activated' },
          { ...testInvite, hash: '0xinvite4', epoch: 149, status: 'expired' },
        ]);
      });

      it('should return invites for epoch', () => {
        const result = db.getEpochInvites(150);
        expect(result.data.length).toBe(3);
        expect(result.total).toBe(3);
      });

      it('should filter by status', () => {
        const result = db.getEpochInvites(150, { status: 'activated' });
        expect(result.data.length).toBe(2);
      });

      it('should support pagination', () => {
        const result = db.getEpochInvites(150, { limit: 2, offset: 0 });
        expect(result.data.length).toBe(2);
        expect(result.hasMore).toBe(true);
      });
    });

    describe('getEpochInvitesSummary()', () => {
      it('should return invite statistics for epoch', () => {
        db.insertInvitesBatch([
          { ...testInvite, hash: '0xinvite1', inviter: '0xAddr1', status: 'pending' },
          { ...testInvite, hash: '0xinvite2', inviter: '0xAddr1', status: 'activated' },
          { ...testInvite, hash: '0xinvite3', inviter: '0xAddr2', status: 'activated' },
          { ...testInvite, hash: '0xinvite4', inviter: '0xAddr3', status: 'expired' },
        ]);

        const summary = db.getEpochInvitesSummary(150);
        expect(summary.totalInvites).toBe(4);
        expect(summary.uniqueInviters).toBe(3);
        expect(summary.activated).toBe(2);
        expect(summary.pending).toBe(1);
        expect(summary.expired).toBe(1);
        expect(summary.activationRate).toBe('50.00%');
      });

      it('should return null when no invites', () => {
        const summary = db.getEpochInvitesSummary(999);
        expect(summary).toBeNull();
      });
    });
  });

  describe('getStats() with Phase 4 tables', () => {
    it('should include invite count', () => {
      db.insertInvite({
        hash: '0xinvite1',
        inviter: '0xaddr1',
        epoch: 150,
        status: 'pending',
        timestamp: 1704067200,
      });

      const stats = db.getStats();
      expect(stats.inviteCount).toBe(1);
    });
  });
});

// Export the HistoryDB class for testing
module.exports = { HistoryDB: require('../src/db').constructor };
