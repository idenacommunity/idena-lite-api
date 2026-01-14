/**
 * Background Sync Service
 *
 * Syncs blockchain data from RPC node to SQLite database.
 * Runs in the background, processing blocks in batches.
 */

const IdenaRPC = require('./rpc');
const historyDB = require('./db');

class SyncService {
  constructor() {
    this.rpc = new IdenaRPC();
    this.isRunning = false;
    this.shouldStop = false;
    this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 100;
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL) || 5000; // ms between batches
    this.enabled = process.env.HISTORY_ENABLED !== 'false';
  }

  /**
   * Start the sync process
   */
  async start() {
    if (!this.enabled) {
      console.log('Historical sync disabled');
      return;
    }

    if (this.isRunning) {
      console.log('Sync already running');
      return;
    }

    console.log('Starting historical sync service...');
    this.isRunning = true;
    this.shouldStop = false;

    // Initialize database
    historyDB.init();

    // Start sync loop
    this._syncLoop();
  }

  /**
   * Stop the sync process
   */
  stop() {
    console.log('Stopping sync service...');
    this.shouldStop = true;
    this.isRunning = false;
  }

  /**
   * Main sync loop
   */
  async _syncLoop() {
    while (!this.shouldStop) {
      try {
        await this._syncBatch();
      } catch (error) {
        console.error('Sync error:', error.message);
      }

      // Wait before next batch
      await this._sleep(this.syncInterval);
    }

    historyDB.updateSyncStatus(
      historyDB.getSyncStatus()?.lastSyncedBlock || 0,
      null,
      false
    );
    console.log('Sync service stopped');
  }

  /**
   * Sync a batch of blocks
   */
  async _syncBatch() {
    // Get current sync status
    const status = historyDB.getSyncStatus();
    if (!status) return;

    // Get current chain height from RPC
    let currentHeight;
    try {
      const syncingResult = await this.rpc.call('bcn_syncing', []);
      currentHeight = syncingResult?.currentBlock || syncingResult?.highestBlock;

      if (!currentHeight) {
        // Try alternative method
        const lastBlock = await this.rpc.call('bcn_lastBlock', []);
        currentHeight = lastBlock?.height;
      }
    } catch (error) {
      console.error('Failed to get chain height:', error.message);
      return;
    }

    if (!currentHeight) {
      console.log('Could not determine chain height, skipping batch');
      return;
    }

    // Update highest known block
    historyDB.updateSyncStatus(status.lastSyncedBlock, currentHeight, true);

    // Determine start block
    let startBlock = status.lastSyncedBlock + 1;

    // If this is first sync, start from a reasonable point (not genesis)
    // Use fast sync start point or recent blocks
    if (startBlock <= 1) {
      // Start from 1000 blocks ago or genesis
      startBlock = Math.max(1, currentHeight - 1000);
      historyDB.setSyncStartBlock(startBlock);
      console.log(`Starting initial sync from block ${startBlock}`);
    }

    // Check if we're caught up
    if (startBlock > currentHeight) {
      // Already synced, just update status
      historyDB.updateSyncStatus(currentHeight, currentHeight, false);
      return;
    }

    // Calculate end block for this batch
    const endBlock = Math.min(startBlock + this.batchSize - 1, currentHeight);

    console.log(`Syncing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock + 1} blocks)`);

    // Fetch and process blocks
    const blocks = [];
    const transactions = [];

    for (let height = startBlock; height <= endBlock; height++) {
      try {
        const block = await this._fetchBlock(height);
        if (block) {
          blocks.push(block);

          // Fetch transactions for this block
          if (block.transactions && block.transactions.length > 0) {
            for (let i = 0; i < block.transactions.length; i++) {
              const txHash = block.transactions[i];
              const tx = await this._fetchTransaction(txHash, height, block.timestamp, i);
              if (tx) {
                transactions.push(tx);
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to fetch block ${height}:`, error.message);
        // Continue with next block
      }

      // Small delay between blocks to avoid overwhelming RPC
      if (height % 10 === 0) {
        await this._sleep(50);
      }
    }

    // Batch insert to database
    if (blocks.length > 0) {
      historyDB.insertBatch(blocks, transactions);
      historyDB.updateSyncStatus(endBlock, currentHeight, true);
      console.log(`Synced ${blocks.length} blocks, ${transactions.length} transactions`);
    }
  }

  /**
   * Fetch a single block
   */
  async _fetchBlock(height) {
    try {
      const block = await this.rpc.call('bcn_blockAt', [height]);
      if (!block) return null;

      return {
        height: block.height,
        hash: block.hash,
        timestamp: block.timestamp,
        epoch: block.epoch || 0,
        proposer: block.coinbase || block.proposer,
        txCount: block.transactions?.length || 0,
        transactions: block.transactions || [],
      };
    } catch (error) {
      // Block might not exist yet
      return null;
    }
  }

  /**
   * Fetch a single transaction
   */
  async _fetchTransaction(hash, blockHeight, blockTimestamp, txIndex) {
    try {
      const tx = await this.rpc.call('bcn_transaction', [hash]);

      // During fast sync, transaction details might not be available
      if (!tx) {
        // Store minimal info from block
        return {
          hash,
          blockHeight,
          txIndex,
          type: 'unknown',
          from: '0x0000000000000000000000000000000000000000',
          to: null,
          amount: '0',
          fee: '0',
          nonce: null,
          timestamp: blockTimestamp,
        };
      }

      return {
        hash: tx.hash,
        blockHeight,
        txIndex,
        type: tx.type || 'unknown',
        from: tx.from,
        to: tx.to,
        amount: tx.amount || '0',
        fee: tx.maxFee || tx.fee || '0',
        nonce: tx.nonce,
        timestamp: blockTimestamp,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get sync status
   */
  getStatus() {
    const dbStatus = historyDB.getSyncStatus();
    const dbStats = historyDB.getStats();

    return {
      enabled: this.enabled,
      running: this.isRunning,
      ...dbStatus,
      database: dbStats,
    };
  }

  /**
   * Sleep helper
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
const syncService = new SyncService();

module.exports = syncService;
