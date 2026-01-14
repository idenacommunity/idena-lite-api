/**
 * SQLite Database Layer for Historical Queries
 *
 * Provides lightweight storage for blockchain data:
 * - Blocks (height, hash, timestamp, epoch)
 * - Transactions (hash, type, from, to, amount)
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

      -- Indexes for efficient queries
      CREATE INDEX IF NOT EXISTS idx_transactions_from ON transactions(LOWER(from_addr));
      CREATE INDEX IF NOT EXISTS idx_transactions_to ON transactions(LOWER(to_addr));
      CREATE INDEX IF NOT EXISTS idx_transactions_block ON transactions(block_height);
      CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_blocks_epoch ON blocks(epoch);
      CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp DESC);
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

    return {
      enabled: true,
      blockCount,
      txCount,
      blockRange: minBlock && maxBlock ? { min: minBlock, max: maxBlock } : null,
    };
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
