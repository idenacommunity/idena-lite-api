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
    this.balanceTrackingEnabled = process.env.BALANCE_TRACKING_ENABLED !== 'false';
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

      // Track balance changes from transactions
      if (this.balanceTrackingEnabled && transactions.length > 0) {
        await this._trackBalanceChangesFromTransactions(transactions, blocks);
      }

      // Track invites from transactions
      if (transactions.length > 0) {
        await this._trackInvitesFromTransactions(transactions, blocks);
      }

      // Track contracts from transactions
      if (transactions.length > 0) {
        await this._trackContractsFromTransactions(transactions, blocks);
      }

      // Detect epoch boundaries and handle them
      await this._detectEpochBoundaries(blocks);

      historyDB.updateSyncStatus(endBlock, currentHeight, true);
      console.log(`Synced ${blocks.length} blocks, ${transactions.length} transactions`);
    }
  }

  /**
   * Track balance changes from transactions
   * Creates balance_change records for tx_in and tx_out events
   */
  async _trackBalanceChangesFromTransactions(transactions, blocks) {
    try {
      const balanceChanges = [];
      const blockMap = new Map(blocks.map(b => [b.height, b]));

      // Transaction types that affect balance
      const transferTypes = ['send', 'transfer', 'SendTx', 'TransferTx'];

      for (const tx of transactions) {
        const block = blockMap.get(tx.blockHeight);
        const timestamp = block?.timestamp || tx.timestamp;
        const amount = tx.amount || '0';

        // Skip zero-amount transactions
        if (amount === '0' || amount === 0) continue;

        // Skip if no valid addresses
        if (!tx.from && !tx.to) continue;

        // Check if this is a transfer-type transaction
        const isTransfer = transferTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        // For sender (tx_out) - deduct from balance
        if (tx.from && tx.from !== '0x0000000000000000000000000000000000000000') {
          balanceChanges.push({
            address: tx.from,
            blockHeight: tx.blockHeight,
            txHash: tx.hash,
            changeType: 'tx_out',
            amount: `-${amount}`, // Negative for outgoing
            balanceAfter: null, // We'll calculate this if needed
            timestamp,
          });
        }

        // For receiver (tx_in) - add to balance
        if (tx.to && isTransfer) {
          balanceChanges.push({
            address: tx.to,
            blockHeight: tx.blockHeight,
            txHash: tx.hash,
            changeType: 'tx_in',
            amount: amount,
            balanceAfter: null,
            timestamp,
          });
        }

        // Handle special transaction types
        if (tx.type === 'stake' || tx.type === 'StakeTx') {
          balanceChanges.push({
            address: tx.from,
            blockHeight: tx.blockHeight,
            txHash: tx.hash,
            changeType: 'stake',
            amount: `-${amount}`,
            balanceAfter: null,
            timestamp,
          });
        }

        if (tx.type === 'unstake' || tx.type === 'UnstakeTx') {
          balanceChanges.push({
            address: tx.from,
            blockHeight: tx.blockHeight,
            txHash: tx.hash,
            changeType: 'unstake',
            amount: amount,
            balanceAfter: null,
            timestamp,
          });
        }
      }

      // Batch insert balance changes
      if (balanceChanges.length > 0) {
        historyDB.insertBalanceChangesBatch(balanceChanges);
      }
    } catch (error) {
      console.error('Failed to track balance changes:', error.message);
    }
  }

  /**
   * Track invites from transactions
   * Creates invite records for InviteTx and ActivationTx transactions
   */
  async _trackInvitesFromTransactions(transactions, blocks) {
    try {
      const invites = [];
      const activations = [];
      const blockMap = new Map(blocks.map(b => [b.height, b]));

      // Invite-related transaction types
      const inviteTypes = ['invite', 'InviteTx'];
      const activationTypes = ['activation', 'ActivationTx'];

      for (const tx of transactions) {
        const block = blockMap.get(tx.blockHeight);
        const timestamp = block?.timestamp || tx.timestamp;
        const epoch = block?.epoch || 0;

        // Check for invite transactions
        const isInvite = inviteTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        if (isInvite && tx.from) {
          invites.push({
            hash: tx.hash,
            inviter: tx.from,
            invitee: null, // Will be filled when activation happens
            epoch: epoch,
            activationHash: null,
            activationTxHash: null,
            status: 'pending',
            blockHeight: tx.blockHeight,
            timestamp,
          });
        }

        // Check for activation transactions
        const isActivation = activationTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        if (isActivation && tx.from) {
          // Store activation info to update corresponding invite
          activations.push({
            invitee: tx.from,
            activationTxHash: tx.hash,
            epoch: epoch,
            timestamp,
          });
        }
      }

      // Batch insert new invites
      if (invites.length > 0) {
        historyDB.insertInvitesBatch(invites);
      }

      // Update invites with activation info
      // Note: This is a simplified approach - in production, we'd need to
      // match activations to specific invites using the invite key/code
      for (const activation of activations) {
        // Update any pending invite for this epoch as activated
        // This is a best-effort match since we don't have the invite key
        historyDB.updateInviteStatus(
          null, // We don't have the exact hash
          'activated',
          activation.invitee,
          activation.activationTxHash
        );
      }
    } catch (error) {
      console.error('Failed to track invites:', error.message);
    }
  }

  /**
   * Track contracts from transactions
   * Creates contract and contract_call records for contract-related transactions
   */
  async _trackContractsFromTransactions(transactions, blocks) {
    try {
      const contracts = [];
      const contractCalls = [];
      const blockMap = new Map(blocks.map(b => [b.height, b]));

      // Contract-related transaction types
      const deployTypes = ['DeployContractTx', 'deploy_contract', 'deployContract'];
      const callTypes = ['CallContractTx', 'call_contract', 'callContract'];
      const terminateTypes = ['TerminateContractTx', 'terminate_contract', 'terminateContract'];

      for (const tx of transactions) {
        const block = blockMap.get(tx.blockHeight);
        const timestamp = block?.timestamp || tx.timestamp;
        const epoch = block?.epoch || 0;

        // Check for contract deployment
        const isDeploy = deployTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        if (isDeploy && tx.from) {
          // For deploy, the contract address is typically in tx.to or derived from tx
          const contractAddress = tx.to || tx.contractAddress || this._deriveContractAddress(tx.from, tx.nonce);

          if (contractAddress) {
            contracts.push({
              address: contractAddress,
              deployTxHash: tx.hash,
              deployer: tx.from,
              codeHash: tx.payload?.codeHash || null,
              stake: tx.amount || '0',
              state: 'active',
              epoch: epoch,
              blockHeight: tx.blockHeight,
              timestamp,
            });
          }
        }

        // Check for contract calls
        const isCall = callTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        if (isCall && tx.to) {
          contractCalls.push({
            txHash: tx.hash,
            contractAddress: tx.to,
            caller: tx.from,
            method: tx.payload?.method || null,
            amount: tx.amount || '0',
            success: true, // We can't determine failure from tx alone
            blockHeight: tx.blockHeight,
            timestamp,
          });
        }

        // Check for contract termination
        const isTerminate = terminateTypes.some(t =>
          tx.type?.toLowerCase().includes(t.toLowerCase())
        );

        if (isTerminate && tx.to) {
          // Update contract state to terminated
          historyDB.updateContractState(tx.to, 'terminated');

          // Also log as a contract call
          contractCalls.push({
            txHash: tx.hash,
            contractAddress: tx.to,
            caller: tx.from,
            method: 'terminate',
            amount: tx.amount || '0',
            success: true,
            blockHeight: tx.blockHeight,
            timestamp,
          });
        }
      }

      // Batch insert new contracts
      if (contracts.length > 0) {
        historyDB.insertContractsBatch(contracts);
      }

      // Before inserting contract calls, ensure all referenced contracts exist
      // This handles cases where contracts were deployed before our sync range
      if (contractCalls.length > 0) {
        const uniqueContractAddresses = [...new Set(contractCalls.map(c => c.contractAddress))];
        const missingContracts = [];

        for (const addr of uniqueContractAddresses) {
          const existing = historyDB.getContract(addr);
          if (!existing) {
            // Find the first call to this contract to get metadata
            const firstCall = contractCalls.find(c => c.contractAddress === addr);
            missingContracts.push({
              address: addr,
              deployTxHash: 'unknown', // Deployed before our sync range
              deployer: 'unknown',
              codeHash: null,
              stake: '0',
              state: 'active',
              epoch: 0,
              blockHeight: firstCall?.blockHeight || 0,
              timestamp: firstCall?.timestamp || 0,
            });
          }
        }

        // Insert placeholder contracts for missing ones
        if (missingContracts.length > 0) {
          historyDB.insertContractsBatch(missingContracts);
        }

        // Now insert contract calls
        historyDB.insertContractCallsBatch(contractCalls);
      }
    } catch (error) {
      console.error('Failed to track contracts:', error.message);
    }
  }

  /**
   * Derive contract address from deployer and nonce
   * This is a simplified version - actual derivation depends on Idena's implementation
   */
  _deriveContractAddress(deployer, nonce) {
    // In Idena, contract address derivation may differ from Ethereum
    // This is a placeholder - actual implementation would need to match Idena's algorithm
    if (!deployer) return null;

    // For now, return null and rely on tx.to containing the contract address
    // In production, this should implement Idena's address derivation
    return null;
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

        // Fetch rewards for the closed epoch (after validation is complete)
        if (this.epochSnapshotEnabled && this.lastSeenEpoch !== null) {
          await this._fetchEpochRewards(this.lastSeenEpoch);
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
   * Fetch and store rewards for a completed epoch
   * Called after epoch closes (when new epoch starts)
   */
  async _fetchEpochRewards(epochNum) {
    if (!this.epochSnapshotEnabled) return;

    try {
      // Get all identities that were active in this epoch
      const identityStates = historyDB.getEpochIdentities(epochNum, { limit: 10000, offset: 0 });

      if (!identityStates.data || identityStates.data.length === 0) {
        console.log(`No identities found for epoch ${epochNum}, skipping reward fetch`);
        return;
      }

      const rewards = [];
      const validationResults = [];
      const penalties = [];
      const addresses = identityStates.data.map(ids => ids.address);

      // Fetch rewards in batches
      for (let i = 0; i < addresses.length; i += this.concurrency) {
        const batch = addresses.slice(i, i + this.concurrency);

        const fetchPromises = batch.map(async addr => {
          try {
            // Try to fetch epoch rewards for identity
            // Note: This RPC call may vary depending on Idena node version
            const epochIdentity = await this.rpc.call('dna_epochIdentity', [addr, epochNum]);

            if (epochIdentity) {
              // Extract validation results
              const validationResult = {
                address: addr,
                epoch: epochNum,
                shortAnswers: epochIdentity.shortAnswers || 0,
                shortCorrect: epochIdentity.shortFlips?.filter(f => f.gradeScore > 0).length || 0,
                longAnswers: epochIdentity.longAnswers || 0,
                longCorrect: epochIdentity.longFlips?.filter(f => f.gradeScore > 0).length || 0,
                madeFlips: epochIdentity.madeFlips || 0,
                qualifiedFlips: epochIdentity.madeFlips || 0,
                totalReward: epochIdentity.totalReward || '0',
                missedValidation: epochIdentity.missed || false,
              };

              // Extract rewards by type
              if (epochIdentity.rewards && Array.isArray(epochIdentity.rewards)) {
                for (const reward of epochIdentity.rewards) {
                  rewards.push({
                    address: addr,
                    epoch: epochNum,
                    type: reward.type || 'unknown',
                    amount: reward.balance || reward.amount || '0',
                  });
                }
              } else if (epochIdentity.totalReward) {
                // If no detailed rewards, store as validation reward
                rewards.push({
                  address: addr,
                  epoch: epochNum,
                  type: 'validation',
                  amount: epochIdentity.totalReward,
                });
              }

              // Extract penalties if present
              if (epochIdentity.penalty && epochIdentity.penalty !== '0') {
                penalties.push({
                  address: addr,
                  epoch: epochNum,
                  penalty: epochIdentity.penalty,
                  reason: epochIdentity.penaltyReason || (validationResult.missedValidation ? 'missed_validation' : 'other'),
                  blockHeight: null,
                  timestamp: Math.floor(Date.now() / 1000),
                });
              }

              // Also check for bad flip penalties
              if (epochIdentity.badFlipPenalty && epochIdentity.badFlipPenalty !== '0') {
                penalties.push({
                  address: addr,
                  epoch: epochNum,
                  penalty: epochIdentity.badFlipPenalty,
                  reason: 'bad_flip',
                  blockHeight: null,
                  timestamp: Math.floor(Date.now() / 1000),
                });
              }

              return validationResult;
            }
            return null;
          } catch {
            // RPC method might not be available
            return null;
          }
        });

        const results = await Promise.all(fetchPromises);
        validationResults.push(...results.filter(Boolean));
      }

      // Store rewards and validation results
      if (rewards.length > 0) {
        historyDB.insertRewardsBatch(rewards);
        console.log(`Stored ${rewards.length} reward entries for epoch ${epochNum}`);

        // Also track rewards as balance changes
        if (this.balanceTrackingEnabled) {
          const rewardBalanceChanges = rewards
            .filter(r => r.amount && r.amount !== '0')
            .map(r => ({
              address: r.address,
              blockHeight: null, // Rewards are epoch-level, not block-level
              txHash: null,
              changeType: 'reward',
              amount: r.amount,
              balanceAfter: null,
              timestamp: Math.floor(Date.now() / 1000), // Use current time as approximation
            }));

          if (rewardBalanceChanges.length > 0) {
            historyDB.insertBalanceChangesBatch(rewardBalanceChanges);
          }
        }
      }

      if (validationResults.length > 0) {
        historyDB.insertValidationResultsBatch(validationResults);
        console.log(`Stored ${validationResults.length} validation results for epoch ${epochNum}`);
      }

      // Store penalties
      if (penalties.length > 0) {
        historyDB.insertPenaltiesBatch(penalties);
        console.log(`Stored ${penalties.length} penalties for epoch ${epochNum}`);

        // Also track penalties as balance changes
        if (this.balanceTrackingEnabled) {
          const penaltyBalanceChanges = penalties
            .filter(p => p.penalty && p.penalty !== '0')
            .map(p => ({
              address: p.address,
              blockHeight: p.blockHeight,
              txHash: null,
              changeType: 'penalty',
              amount: `-${p.penalty}`, // Negative for penalty
              balanceAfter: null,
              timestamp: p.timestamp,
            }));

          if (penaltyBalanceChanges.length > 0) {
            historyDB.insertBalanceChangesBatch(penaltyBalanceChanges);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch epoch rewards for epoch ${epochNum}:`, error.message);
    }
  }

  /**
   * Alternative: Calculate rewards from identity state transitions
   * This can be used as a fallback if epoch-specific RPC calls aren't available
   */
  async _calculateRewardsFromStates(epochNum) {
    if (!this.epochSnapshotEnabled) return;

    try {
      // Get identity states for this epoch
      const currentStates = historyDB.getEpochIdentities(epochNum, { limit: 10000, offset: 0 });
      if (!currentStates.data || currentStates.data.length === 0) return;

      const validationResults = [];

      for (const state of currentStates.data) {
        // Determine if identity passed validation based on state transition
        const prevEpochState = historyDB.getIdentityState(state.address, epochNum - 1);
        const passedValidation = this._didPassValidation(prevEpochState?.state, state.state);

        validationResults.push({
          address: state.address,
          epoch: epochNum,
          shortAnswers: 0,
          shortCorrect: 0,
          longAnswers: 0,
          longCorrect: 0,
          madeFlips: 0,
          qualifiedFlips: 0,
          totalReward: '0', // Would need to fetch actual balance changes
          missedValidation: !passedValidation,
        });
      }

      if (validationResults.length > 0) {
        historyDB.insertValidationResultsBatch(validationResults);
        console.log(`Calculated ${validationResults.length} validation results for epoch ${epochNum} from state transitions`);
      }
    } catch (error) {
      console.error(`Failed to calculate rewards for epoch ${epochNum}:`, error.message);
    }
  }

  /**
   * Determine if an identity passed validation based on state transition
   */
  _didPassValidation(prevState, newState) {
    const passingStates = ['Newbie', 'Verified', 'Human', 'Suspended'];
    const failingTransitions = ['Zombie', 'Killed', 'Undefined'];

    // If new state is a failing state, they didn't pass
    if (failingTransitions.includes(newState)) {
      return false;
    }

    // If they're in a passing state, they likely passed
    if (passingStates.includes(newState)) {
      return true;
    }

    return false;
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
