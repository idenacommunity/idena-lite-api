/**
 * Background Sync Service
 *
 * Syncs blockchain data from RPC node to SQLite database.
 * Runs in the background, processing blocks in batches.
 * Detects epoch boundaries and snapshots identity states.
 */

const IdenaRPC = require('./rpc');
const historyDB = require('./db');

class SyncService {
  constructor() {
    this.rpc = new IdenaRPC();
    this.isRunning = false;
    this.shouldStop = false;
    this.batchSize = parseInt(process.env.SYNC_BATCH_SIZE) || 500;
    this.syncInterval = parseInt(process.env.SYNC_INTERVAL) || 1000; // ms between batches
    this.concurrency = parseInt(process.env.SYNC_CONCURRENCY) || 20; // parallel requests
    this.enabled = process.env.HISTORY_ENABLED !== 'false';
    this.lastSeenEpoch = null; // Track epoch for boundary detection
    this.epochSnapshotEnabled = process.env.EPOCH_SNAPSHOT_ENABLED !== 'false';
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

    // Fetch blocks in parallel with concurrency limit
    const blocks = [];
    const transactions = [];
    const heights = [];

    for (let h = startBlock; h <= endBlock; h++) {
      heights.push(h);
    }

    // Process blocks in chunks with concurrency limit
    for (let i = 0; i < heights.length; i += this.concurrency) {
      const chunk = heights.slice(i, i + this.concurrency);
      const blockPromises = chunk.map(height => this._fetchBlock(height));
      const fetchedBlocks = await Promise.all(blockPromises);

      for (const block of fetchedBlocks) {
        if (block) {
          blocks.push(block);

          // Fetch transactions in parallel for this block
          if (block.transactions && block.transactions.length > 0) {
            const txPromises = block.transactions.map((txHash, idx) =>
              this._fetchTransaction(txHash, block.height, block.timestamp, idx)
            );
            const fetchedTxs = await Promise.all(txPromises);
            for (const tx of fetchedTxs) {
              if (tx) {
                transactions.push(tx);
              }
            }
          }
        }
      }
    }

    // Batch insert to database
    if (blocks.length > 0) {
      historyDB.insertBatch(blocks, transactions);

      // Detect epoch boundaries and handle them
      await this._detectEpochBoundaries(blocks);

      historyDB.updateSyncStatus(endBlock, currentHeight, true);
      console.log(`Synced ${blocks.length} blocks, ${transactions.length} transactions`);
    }
  }

  /**
   * Detect epoch boundaries in a batch of blocks
   */
  async _detectEpochBoundaries(blocks) {
    if (!blocks.length) return;

    // Sort blocks by height to process in order
    const sortedBlocks = [...blocks].sort((a, b) => a.height - b.height);

    // Initialize lastSeenEpoch from database if not set
    if (this.lastSeenEpoch === null) {
      const lastEpoch = historyDB.getLastEpoch();
      this.lastSeenEpoch = lastEpoch ? lastEpoch.epoch : null;
    }

    for (const block of sortedBlocks) {
      const currentEpoch = block.epoch;

      // First block we've seen - initialize epoch
      if (this.lastSeenEpoch === null) {
        await this._createEpoch(currentEpoch, block);
        this.lastSeenEpoch = currentEpoch;
        continue;
      }

      // Epoch changed - handle boundary
      if (currentEpoch !== this.lastSeenEpoch) {
        // Close the previous epoch
        const prevBlock = sortedBlocks.find(b => b.epoch === this.lastSeenEpoch && b.height < block.height);
        if (prevBlock) {
          await this._closeEpoch(this.lastSeenEpoch, prevBlock);
        }

        // Create new epoch
        await this._createEpoch(currentEpoch, block);

        // Snapshot identity states for the new epoch
        if (this.epochSnapshotEnabled) {
          await this._snapshotIdentityStates(currentEpoch, block);
        }

        console.log(`Epoch boundary detected: ${this.lastSeenEpoch} -> ${currentEpoch}`);
        this.lastSeenEpoch = currentEpoch;
      }
    }
  }

  /**
   * Create a new epoch record
   */
  async _createEpoch(epochNum, firstBlock) {
    // Check if epoch already exists
    const existing = historyDB.getEpoch(epochNum);
    if (existing) return;

    historyDB.insertEpoch({
      epoch: epochNum,
      startBlock: firstBlock.height,
      startTimestamp: firstBlock.timestamp,
      endBlock: null,
      endTimestamp: null,
    });

    console.log(`Created epoch ${epochNum} starting at block ${firstBlock.height}`);
  }

  /**
   * Close an epoch when a new one starts
   */
  async _closeEpoch(epochNum, lastBlock) {
    // Calculate epoch statistics
    const stats = this._calculateEpochStats(epochNum);

    historyDB.closeEpoch(epochNum, lastBlock.height, lastBlock.timestamp, stats);
    console.log(`Closed epoch ${epochNum} at block ${lastBlock.height}`);
  }

  /**
   * Calculate statistics for an epoch
   */
  _calculateEpochStats(epochNum) {
    // Count blocks and transactions in this epoch
    const stats = historyDB.getStats();

    // For now, return minimal stats - can be enhanced later
    return {
      blockCount: null, // Will be calculated from end_block - start_block
      txCount: null,
      validatedCount: null,
      flipCount: null,
      inviteCount: null,
    };
  }

  /**
   * Snapshot identity states at epoch boundary
   */
  async _snapshotIdentityStates(epochNum, block) {
    try {
      // Fetch all identities from RPC
      const identities = await this.rpc.call('dna_identities', []);

      if (!identities || !Array.isArray(identities)) {
        console.log('No identities returned from RPC, skipping snapshot');
        return;
      }

      // Transform to identity state records
      const identityStates = identities
        .filter(id => id && id.address && id.state)
        .map(id => ({
          address: id.address,
          epoch: epochNum,
          state: id.state,
          prevState: null, // Could be looked up from previous epoch
          blockHeight: block.height,
          timestamp: block.timestamp,
        }));

      if (identityStates.length > 0) {
        historyDB.insertIdentityStatesBatch(identityStates);
        console.log(`Snapshotted ${identityStates.length} identity states for epoch ${epochNum}`);
      }

      // Also snapshot address balances for identities
      await this._snapshotAddressStates(epochNum, identities, block);
    } catch (error) {
      console.error(`Failed to snapshot identity states for epoch ${epochNum}:`, error.message);
    }
  }

  /**
   * Snapshot address balances at epoch boundary
   */
  async _snapshotAddressStates(epochNum, identities, block) {
    try {
      const addressStates = [];

      // Fetch balances in batches
      const addresses = identities.map(id => id.address).filter(Boolean);

      for (let i = 0; i < addresses.length; i += this.concurrency) {
        const batch = addresses.slice(i, i + this.concurrency);
        const balancePromises = batch.map(async addr => {
          try {
            const balance = await this.rpc.call('dna_getBalance', [addr]);
            return {
              address: addr,
              epoch: epochNum,
              balance: balance?.balance || '0',
              stake: balance?.stake || '0',
              txCount: 0, // Could be calculated from transactions table
            };
          } catch {
            return null;
          }
        });

        const results = await Promise.all(balancePromises);
        addressStates.push(...results.filter(Boolean));
      }

      if (addressStates.length > 0) {
        historyDB.insertAddressStatesBatch(addressStates);
        console.log(`Snapshotted ${addressStates.length} address states for epoch ${epochNum}`);
      }
    } catch (error) {
      console.error(`Failed to snapshot address states for epoch ${epochNum}:`, error.message);
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
module.exports.SyncService = SyncService;
