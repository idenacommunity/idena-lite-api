/**
 * SQLite Database Layer for Historical Queries
 *
 * Provides lightweight storage for blockchain data:
 * - Blocks (height, hash, timestamp, epoch)
 * - Transactions (hash, type, from, to, amount)
 * - Epochs (summary data per validation cycle)
 * - Identity states (state changes per address per epoch)
 * - Address states (balance/stake snapshots per epoch)
 * - Sync status tracking
 */

const Database = require('better-sqlite3');
const path = require('path');

class HistoryDB {
  constructor(dbPath = null) {
    const defaultPath = process.env.SQLITE_PATH || path.join(__dirname, '../data/history.db');
    this.dbPath = dbPath || defaultPath;
    this.db = null;
    this.enabled = process.env.HISTORY_ENABLED !== 'false';
  }

  /**
   * Initialize database connection and schema
   */
  init() {
    if (!this.enabled) {
      console.log('Historical database disabled');
      return;
    }

    try {
      // Ensure data directory exists
      const fs = require('fs');
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      this.db.pragma('journal_mode = WAL'); // Better concurrent access
      this.db.pragma('synchronous = NORMAL'); // Balance safety vs speed

      this._createSchema();
      console.log(`Historical database initialized at ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to initialize historical database:', error.message);
      this.enabled = false;
    }
  }

  /**
   * Create database schema
   */
  _createSchema() {
    this.db.exec(`
      -- Blocks table
      CREATE TABLE IF NOT EXISTS blocks (
        height INTEGER PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        timestamp INTEGER NOT NULL,
        epoch INTEGER NOT NULL,
        proposer TEXT,
        tx_count INTEGER DEFAULT 0
      );

      -- Transactions table
      CREATE TABLE IF NOT EXISTS transactions (
        hash TEXT PRIMARY KEY,
        block_height INTEGER NOT NULL,
        tx_index INTEGER DEFAULT 0,
        type TEXT NOT NULL,
        from_addr TEXT NOT NULL,
        to_addr TEXT,
        amount TEXT DEFAULT '0',
        fee TEXT DEFAULT '0',
        nonce INTEGER,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (block_height) REFERENCES blocks(height)
      );

      -- Sync status table
      CREATE TABLE IF NOT EXISTS sync_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_synced_block INTEGER DEFAULT 0,
        highest_known_block INTEGER DEFAULT 0,
        last_sync_time INTEGER,
        sync_start_block INTEGER DEFAULT 0,
        is_syncing INTEGER DEFAULT 0
      );

      -- Initialize sync status if not exists
      INSERT OR IGNORE INTO sync_status (id, last_synced_block) VALUES (1, 0);

      -- Epochs table (validation cycle summaries)
      CREATE TABLE IF NOT EXISTS epochs (
        epoch INTEGER PRIMARY KEY,
        start_block INTEGER NOT NULL,
        end_block INTEGER,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER,
        validated_count INTEGER DEFAULT 0,
        block_count INTEGER DEFAULT 0,
        tx_count INTEGER DEFAULT 0,
        flip_count INTEGER DEFAULT 0,
        invite_count INTEGER DEFAULT 0
      );

      -- Identity states table (track state changes per epoch)
      CREATE TABLE IF NOT EXISTS identity_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        state TEXT NOT NULL,
        prev_state TEXT,
        block_height INTEGER,
        timestamp INTEGER NOT NULL,
        UNIQUE(address, epoch)
      );

      -- Address states table (balance/stake snapshots per epoch)
      CREATE TABLE IF NOT EXISTS address_states (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        balance TEXT DEFAULT '0',
        stake TEXT DEFAULT '0',
        tx_count INTEGER DEFAULT 0,
        UNIQUE(address, epoch)
      );

      -- Indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(LOWER(from_addr));
      CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(LOWER(to_addr));
      CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_height);
      CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_blocks_epoch ON blocks(epoch);
      CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_identity_states_addr ON identity_states(LOWER(address));
      CREATE INDEX IF NOT EXISTS idx_identity_states_epoch ON identity_states(epoch);
      CREATE INDEX IF NOT EXISTS idx_address_states_addr ON address_states(LOWER(address));
      CREATE INDEX IF NOT EXISTS idx_address_states_epoch ON address_states(epoch);
      CREATE INDEX IF NOT EXISTS idx_epochs_start_block ON epochs(start_block);
    `);
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare('SELECT * FROM sync_status WHERE id = 1').get();
    return {
      lastSyncedBlock: row.last_synced_block,
      highestKnownBlock: row.highest_known_block,
      lastSyncTime: row.last_sync_time ? new Date(row.last_sync_time * 1000).toISOString() : null,
      syncStartBlock: row.sync_start_block,
      isSyncing: row.is_syncing === 1,
      progress: row.highest_known_block > row.sync_start_block
        ? ((row.last_synced_block - row.sync_start_block) / (row.highest_known_block - row.sync_start_block) * 100).toFixed(2)
        : 0,
    };
  }

  /**
   * Update sync status
   */
  updateSyncStatus(lastSyncedBlock, highestKnownBlock = null, isSyncing = null) {
    if (!this.enabled || !this.db) return;

    const updates = ['last_synced_block = ?', 'last_sync_time = ?'];
    const params = [lastSyncedBlock, Math.floor(Date.now() / 1000)];

    if (highestKnownBlock !== null) {
      updates.push('highest_known_block = ?');
      params.push(highestKnownBlock);
    }

    if (isSyncing !== null) {
      updates.push('is_syncing = ?');
      params.push(isSyncing ? 1 : 0);
    }

    params.push(1); // WHERE id = 1
    this.db.prepare(`UPDATE sync_status SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  /**
   * Set sync start block (for progress calculation)
   */
  setSyncStartBlock(startBlock) {
    if (!this.enabled || !this.db) return;
    this.db.prepare('UPDATE sync_status SET sync_start_block = ? WHERE id = 1').run(startBlock);
  }

  /**
   * Insert a block
   */
  insertBlock(block) {
    if (!this.enabled || !this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO blocks (height, hash, timestamp, epoch, proposer, tx_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      block.height,
      block.hash,
      block.timestamp,
      block.epoch,
      block.proposer || null,
      block.txCount || 0
    );
  }

  /**
   * Insert a transaction
   */
  insertTransaction(tx) {
    if (!this.enabled || !this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO transactions (hash, block_height, tx_index, type, from_addr, to_addr, amount, fee, nonce, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      tx.hash,
      tx.blockHeight,
      tx.txIndex || 0,
      tx.type,
      tx.from,
      tx.to || null,
      tx.amount || '0',
      tx.fee || '0',
      tx.nonce || null,
      tx.timestamp
    );
  }

  /**
   * Batch insert blocks and transactions (for efficiency)
   */
  insertBatch(blocks, transactions) {
    if (!this.enabled || !this.db) return;

    const insertBlock = this.db.prepare(`
      INSERT OR REPLACE INTO blocks (height, hash, timestamp, epoch, proposer, tx_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertTx = this.db.prepare(`
      INSERT OR REPLACE INTO transactions (hash, block_height, tx_index, type, from_addr, to_addr, amount, fee, nonce, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(() => {
      for (const block of blocks) {
        insertBlock.run(
          block.height,
          block.hash,
          block.timestamp,
          block.epoch,
          block.proposer || null,
          block.txCount || 0
        );
      }

      for (const tx of transactions) {
        insertTx.run(
          tx.hash,
          tx.blockHeight,
          tx.txIndex || 0,
          tx.type,
          tx.from,
          tx.to || null,
          tx.amount || '0',
          tx.fee || '0',
          tx.nonce || null,
          tx.timestamp
        );
      }
    });

    insertMany();
  }

  /**
   * Get transactions for an address (sent or received)
   * @param {string} address - Idena address
   * @param {object} options - Query options
   * @returns {object} - Paginated transaction list
   */
  getAddressTransactions(address, options = {}) {
    if (!this.enabled || !this.db) {
      return { data: [], total: 0, hasMore: false, error: 'Historical database not available' };
    }

    const { limit = 50, offset = 0, type = null } = options;
    const addrLower = address.toLowerCase();

    let whereClause = '(LOWER(from_addr) = ? OR LOWER(to_addr) = ?)';
    let params = [addrLower, addrLower];

    if (type) {
      whereClause += ' AND type = ?';
      params.push(type);
    }

    // Get total count
    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM transactions WHERE ${whereClause}`);
    const { count: total } = countStmt.get(...params);

    // Get paginated results
    const dataParams = [...params, limit + 1, offset]; // +1 to check hasMore
    const dataStmt = this.db.prepare(`
      SELECT t.*, b.epoch
      FROM transactions t
      JOIN blocks b ON b.height = t.block_height
      WHERE ${whereClause}
      ORDER BY t.timestamp DESC, t.block_height DESC
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...dataParams);
    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(row => ({
      hash: row.hash,
      blockHeight: row.block_height,
      epoch: row.epoch,
      type: row.type,
      from: row.from_addr,
      to: row.to_addr,
      amount: row.amount,
      fee: row.fee,
      nonce: row.nonce,
      timestamp: row.timestamp,
    }));

    return { data, total, limit, offset, hasMore };
  }

  /**
   * Get block by height
   */
  getBlock(height) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare('SELECT * FROM blocks WHERE height = ?').get(height);
    if (!row) return null;

    return {
      height: row.height,
      hash: row.hash,
      timestamp: row.timestamp,
      epoch: row.epoch,
      proposer: row.proposer,
      txCount: row.tx_count,
    };
  }

  /**
   * Get transaction by hash
   */
  getTransaction(hash) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare(`
      SELECT t.*, b.epoch
      FROM transactions t
      JOIN blocks b ON b.height = t.block_height
      WHERE t.hash = ?
    `).get(hash);

    if (!row) return null;

    return {
      hash: row.hash,
      blockHeight: row.block_height,
      epoch: row.epoch,
      type: row.type,
      from: row.from_addr,
      to: row.to_addr,
      amount: row.amount,
      fee: row.fee,
      nonce: row.nonce,
      timestamp: row.timestamp,
    };
  }

  /**
   * Get database statistics
   */
  getStats() {
    if (!this.enabled || !this.db) {
      return { enabled: false };
    }

    const blockCount = this.db.prepare('SELECT COUNT(*) as count FROM blocks').get().count;
    const txCount = this.db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    const minBlock = this.db.prepare('SELECT MIN(height) as min FROM blocks').get().min;
    const maxBlock = this.db.prepare('SELECT MAX(height) as max FROM blocks').get().max;
    const epochCount = this.db.prepare('SELECT COUNT(*) as count FROM epochs').get().count;
    const identityStateCount = this.db.prepare('SELECT COUNT(*) as count FROM identity_states').get().count;

    return {
      enabled: true,
      blockCount,
      txCount,
      epochCount,
      identityStateCount,
      blockRange: minBlock && maxBlock ? { min: minBlock, max: maxBlock } : null,
    };
  }

  // ==========================================
  // Epoch Methods
  // ==========================================

  /**
   * Insert or update an epoch
   */
  insertEpoch(epoch) {
    if (!this.enabled || !this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO epochs (
        epoch, start_block, end_block, start_timestamp, end_timestamp,
        validated_count, block_count, tx_count, flip_count, invite_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      epoch.epoch,
      epoch.startBlock,
      epoch.endBlock || null,
      epoch.startTimestamp,
      epoch.endTimestamp || null,
      epoch.validatedCount || 0,
      epoch.blockCount || 0,
      epoch.txCount || 0,
      epoch.flipCount || 0,
      epoch.inviteCount || 0
    );
  }

  /**
   * Update epoch end data (when epoch closes)
   */
  closeEpoch(epochNum, endBlock, endTimestamp, stats = {}) {
    if (!this.enabled || !this.db) return;

    this.db.prepare(`
      UPDATE epochs SET
        end_block = ?,
        end_timestamp = ?,
        validated_count = COALESCE(?, validated_count),
        block_count = COALESCE(?, block_count),
        tx_count = COALESCE(?, tx_count),
        flip_count = COALESCE(?, flip_count),
        invite_count = COALESCE(?, invite_count)
      WHERE epoch = ?
    `).run(
      endBlock,
      endTimestamp,
      stats.validatedCount,
      stats.blockCount,
      stats.txCount,
      stats.flipCount,
      stats.inviteCount,
      epochNum
    );
  }

  /**
   * Get epoch by number
   */
  getEpoch(epochNum) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare('SELECT * FROM epochs WHERE epoch = ?').get(epochNum);
    if (!row) return null;

    return this._formatEpochRow(row);
  }

  /**
   * Get the last (most recent) epoch
   */
  getLastEpoch() {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare('SELECT * FROM epochs ORDER BY epoch DESC LIMIT 1').get();
    if (!row) return null;

    return this._formatEpochRow(row);
  }

  /**
   * Get list of epochs with pagination
   */
  getEpochs(options = {}) {
    if (!this.enabled || !this.db) {
      return { data: [], total: 0, hasMore: false };
    }

    const { limit = 50, offset = 0 } = options;

    const total = this.db.prepare('SELECT COUNT(*) as count FROM epochs').get().count;
    const rows = this.db.prepare(`
      SELECT * FROM epochs ORDER BY epoch DESC LIMIT ? OFFSET ?
    `).all(limit + 1, offset);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(row => this._formatEpochRow(row));

    return { data, total, limit, offset, hasMore };
  }

  /**
   * Get epoch by block height
   */
  getEpochByBlock(blockHeight) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare(`
      SELECT * FROM epochs
      WHERE start_block <= ? AND (end_block >= ? OR end_block IS NULL)
      ORDER BY epoch DESC LIMIT 1
    `).get(blockHeight, blockHeight);

    if (!row) return null;
    return this._formatEpochRow(row);
  }

  /**
   * Format epoch row to response object
   */
  _formatEpochRow(row) {
    return {
      epoch: row.epoch,
      startBlock: row.start_block,
      endBlock: row.end_block,
      startTimestamp: row.start_timestamp,
      endTimestamp: row.end_timestamp,
      validatedCount: row.validated_count,
      blockCount: row.block_count,
      txCount: row.tx_count,
      flipCount: row.flip_count,
      inviteCount: row.invite_count,
    };
  }

  // ==========================================
  // Identity State Methods
  // ==========================================

  /**
   * Insert identity state for an epoch
   */
  insertIdentityState(identityState) {
    if (!this.enabled || !this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO identity_states (
        address, epoch, state, prev_state, block_height, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      identityState.address,
      identityState.epoch,
      identityState.state,
      identityState.prevState || null,
      identityState.blockHeight || null,
      identityState.timestamp
    );
  }

  /**
   * Batch insert identity states (for epoch boundary snapshots)
   */
  insertIdentityStatesBatch(states) {
    if (!this.enabled || !this.db || !states.length) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO identity_states (
        address, epoch, state, prev_state, block_height, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(() => {
      for (const s of states) {
        stmt.run(
          s.address,
          s.epoch,
          s.state,
          s.prevState || null,
          s.blockHeight || null,
          s.timestamp
        );
      }
    });

    insertMany();
  }

  /**
   * Get identity state for address at specific epoch
   */
  getIdentityState(address, epochNum) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare(`
      SELECT * FROM identity_states
      WHERE LOWER(address) = LOWER(?) AND epoch = ?
    `).get(address, epochNum);

    if (!row) return null;

    return {
      address: row.address,
      epoch: row.epoch,
      state: row.state,
      prevState: row.prev_state,
      blockHeight: row.block_height,
      timestamp: row.timestamp,
    };
  }

  /**
   * Get identity history across epochs
   */
  getIdentityEpochs(address, options = {}) {
    if (!this.enabled || !this.db) {
      return { data: [], total: 0, hasMore: false };
    }

    const { limit = 50, offset = 0 } = options;
    const addrLower = address.toLowerCase();

    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM identity_states WHERE LOWER(address) = ?'
    ).get(addrLower).count;

    const rows = this.db.prepare(`
      SELECT ids.*, e.start_timestamp as epoch_start, e.end_timestamp as epoch_end
      FROM identity_states ids
      LEFT JOIN epochs e ON e.epoch = ids.epoch
      WHERE LOWER(ids.address) = ?
      ORDER BY ids.epoch DESC
      LIMIT ? OFFSET ?
    `).all(addrLower, limit + 1, offset);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(row => ({
      epoch: row.epoch,
      state: row.state,
      prevState: row.prev_state,
      blockHeight: row.block_height,
      timestamp: row.timestamp,
      epochStart: row.epoch_start,
      epochEnd: row.epoch_end,
    }));

    return { data, total, limit, offset, hasMore };
  }

  /**
   * Get identities in a specific epoch
   */
  getEpochIdentities(epochNum, options = {}) {
    if (!this.enabled || !this.db) {
      return { data: [], total: 0, hasMore: false };
    }

    const { limit = 50, offset = 0, state = null } = options;

    let whereClause = 'epoch = ?';
    let params = [epochNum];

    if (state) {
      whereClause += ' AND state = ?';
      params.push(state);
    }

    const total = this.db.prepare(
      `SELECT COUNT(*) as count FROM identity_states WHERE ${whereClause}`
    ).get(...params).count;

    const rows = this.db.prepare(`
      SELECT * FROM identity_states
      WHERE ${whereClause}
      ORDER BY address
      LIMIT ? OFFSET ?
    `).all(...params, limit + 1, offset);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(row => ({
      address: row.address,
      state: row.state,
      prevState: row.prev_state,
      blockHeight: row.block_height,
      timestamp: row.timestamp,
    }));

    return { data, total, limit, offset, hasMore };
  }

  /**
   * Get identity state counts for an epoch (summary)
   */
  getEpochIdentitySummary(epochNum) {
    if (!this.enabled || !this.db) return null;

    const rows = this.db.prepare(`
      SELECT state, COUNT(*) as count
      FROM identity_states
      WHERE epoch = ?
      GROUP BY state
    `).all(epochNum);

    const summary = {};
    for (const row of rows) {
      summary[row.state] = row.count;
    }

    return summary;
  }

  // ==========================================
  // Address State Methods
  // ==========================================

  /**
   * Insert address state for an epoch
   */
  insertAddressState(addressState) {
    if (!this.enabled || !this.db) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO address_states (
        address, epoch, balance, stake, tx_count
      ) VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      addressState.address,
      addressState.epoch,
      addressState.balance || '0',
      addressState.stake || '0',
      addressState.txCount || 0
    );
  }

  /**
   * Batch insert address states
   */
  insertAddressStatesBatch(states) {
    if (!this.enabled || !this.db || !states.length) return;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO address_states (
        address, epoch, balance, stake, tx_count
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction(() => {
      for (const s of states) {
        stmt.run(
          s.address,
          s.epoch,
          s.balance || '0',
          s.stake || '0',
          s.txCount || 0
        );
      }
    });

    insertMany();
  }

  /**
   * Get address state at specific epoch
   */
  getAddressState(address, epochNum) {
    if (!this.enabled || !this.db) return null;

    const row = this.db.prepare(`
      SELECT * FROM address_states
      WHERE LOWER(address) = LOWER(?) AND epoch = ?
    `).get(address, epochNum);

    if (!row) return null;

    return {
      address: row.address,
      epoch: row.epoch,
      balance: row.balance,
      stake: row.stake,
      txCount: row.tx_count,
    };
  }

  /**
   * Get address state history across epochs
   */
  getAddressStates(address, options = {}) {
    if (!this.enabled || !this.db) {
      return { data: [], total: 0, hasMore: false };
    }

    const { limit = 50, offset = 0 } = options;
    const addrLower = address.toLowerCase();

    const total = this.db.prepare(
      'SELECT COUNT(*) as count FROM address_states WHERE LOWER(address) = ?'
    ).get(addrLower).count;

    const rows = this.db.prepare(`
      SELECT as_tbl.*, e.start_timestamp as epoch_start, e.end_timestamp as epoch_end
      FROM address_states as_tbl
      LEFT JOIN epochs e ON e.epoch = as_tbl.epoch
      WHERE LOWER(as_tbl.address) = ?
      ORDER BY as_tbl.epoch DESC
      LIMIT ? OFFSET ?
    `).all(addrLower, limit + 1, offset);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(row => ({
      epoch: row.epoch,
      balance: row.balance,
      stake: row.stake,
      txCount: row.tx_count,
      epochStart: row.epoch_start,
      epochEnd: row.epoch_end,
    }));

    return { data, total, limit, offset, hasMore };
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton instance
const historyDB = new HistoryDB();

module.exports = historyDB;
module.exports.HistoryDB = HistoryDB;
