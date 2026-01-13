const axios = require('axios');

class IdenaRPC {
  constructor(url = process.env.IDENA_RPC_URL || 'http://localhost:9009') {
    this.url = url;
    this.apiKey = process.env.IDENA_API_KEY || '';
  }

  async call(method, params = []) {
    try {
      const response = await axios.post(
        this.url,
        {
          jsonrpc: '2.0',
          method: method,
          params: params,
          id: Date.now(),
          key: this.apiKey,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      if (response.data.error) {
        throw new Error(response.data.error.message || 'RPC error');
      }

      return response.data.result;
    } catch (error) {
      if (error.response) {
        throw new Error(`RPC call failed: ${error.response.data?.error?.message || error.message}`);
      }
      throw new Error(`Network error: ${error.message}`);
    }
  }

  // Identity methods
  getIdentity(address) {
    return this.call('dna_identity', [address]);
  }

  getIdentities() {
    return this.call('dna_identities');
  }

  // Epoch methods
  getEpoch() {
    return this.call('dna_epoch');
  }

  getCeremonyIntervals() {
    return this.call('dna_ceremonyIntervals');
  }

  // Network methods
  async getNetworkSize() {
    const identities = await this.getIdentities();
    return identities ? identities.length : 0;
  }

  // Stake method
  async getStake(address) {
    const identity = await this.getIdentity(address);
    return identity ? identity.stake : null;
  }

  // Health check
  async getNodeHealth() {
    try {
      const epoch = await this.getEpoch();
      return {
        healthy: true,
        currentEpoch: epoch.epoch,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Batch identity fetch with filtering
  async getFilteredIdentities(filter = {}) {
    const identities = await this.getIdentities();

    if (!identities) {
      return [];
    }

    let filtered = identities;

    // Filter by state (e.g., 'Human', 'Verified', 'Newbie')
    if (filter.states && Array.isArray(filter.states)) {
      filtered = filtered.filter((i) => filter.states.includes(i.state));
    }

    // Filter by minimum stake
    if (filter.minStake) {
      filtered = filtered.filter((i) => parseFloat(i.stake || 0) >= parseFloat(filter.minStake));
    }

    // Pagination
    const limit = filter.limit || 100;
    const offset = filter.offset || 0;

    return {
      total: filtered.length,
      limit,
      offset,
      data: filtered.slice(offset, offset + limit),
    };
  }
}

module.exports = IdenaRPC;
