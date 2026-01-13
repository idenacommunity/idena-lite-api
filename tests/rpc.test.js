const IdenaRPC = require('../src/rpc');
const axios = require('axios');

// Mock axios
jest.mock('axios');

describe('IdenaRPC Client', () => {
  let rpc;

  beforeEach(() => {
    rpc = new IdenaRPC('http://test-node:9009');
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default URL from env', () => {
      const defaultRpc = new IdenaRPC();
      // In test environment, should use IDENA_RPC_URL from .env.test
      expect(defaultRpc.url).toBe(process.env.IDENA_RPC_URL || 'http://localhost:9009');
    });

    it('should initialize with custom URL', () => {
      expect(rpc.url).toBe('http://test-node:9009');
    });

    it('should fall back to localhost when IDENA_RPC_URL is not set', () => {
      const originalUrl = process.env.IDENA_RPC_URL;
      delete process.env.IDENA_RPC_URL;

      const fallbackRpc = new IdenaRPC();
      expect(fallbackRpc.url).toBe('http://localhost:9009');

      // Restore original value
      if (originalUrl !== undefined) {
        process.env.IDENA_RPC_URL = originalUrl;
      }
    });
  });

  describe('call method', () => {
    it('should make successful RPC call', async () => {
      const mockResult = { epoch: 100 };
      axios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: mockResult,
          id: 1,
        },
      });

      const result = await rpc.call('dna_epoch', []);

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
    });

    it('should handle RPC error response', async () => {
      axios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          error: {
            message: 'Method not found',
          },
          id: 1,
        },
      });

      await expect(rpc.call('invalid_method')).rejects.toThrow('Method not found');
    });

    it('should handle network errors', async () => {
      axios.post.mockRejectedValue(new Error('Network timeout'));

      await expect(rpc.call('dna_epoch')).rejects.toThrow('Network error');
    });

    it('should handle HTTP error response', async () => {
      const httpError = new Error('Request failed');
      httpError.response = {
        status: 500,
        data: {
          error: {
            message: 'Internal server error',
          },
        },
      };
      axios.post.mockRejectedValue(httpError);

      await expect(rpc.call('dna_epoch')).rejects.toThrow('RPC call failed: Internal server error');
    });

    it('should handle HTTP error response without error message', async () => {
      const httpError = new Error('Request failed with status 500');
      httpError.response = {
        status: 500,
        data: {},
      };
      axios.post.mockRejectedValue(httpError);

      await expect(rpc.call('dna_epoch')).rejects.toThrow('RPC call failed: Request failed with status 500');
    });

    it('should handle RPC error without message', async () => {
      axios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          error: {},
          id: 1,
        },
      });

      await expect(rpc.call('invalid_method')).rejects.toThrow('RPC error');
    });
  });

  describe('getIdentity', () => {
    it('should fetch identity by address', async () => {
      const mockIdentity = {
        address: '0x123',
        state: 'Human',
        stake: '1000',
      };

      axios.post.mockResolvedValue({
        data: { result: mockIdentity },
      });

      const result = await rpc.getIdentity('0x123');

      expect(result).toEqual(mockIdentity);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'dna_identity',
          params: ['0x123'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getEpoch', () => {
    it('should fetch current epoch', async () => {
      const mockEpoch = { epoch: 100 };
      axios.post.mockResolvedValue({
        data: { result: mockEpoch },
      });

      const result = await rpc.getEpoch();

      expect(result).toEqual(mockEpoch);
    });
  });

  describe('getCeremonyIntervals', () => {
    it('should fetch ceremony intervals', async () => {
      const mockIntervals = {
        FlipLotteryDuration: 300,
        ShortSessionDuration: 120,
        LongSessionDuration: 1800,
      };
      axios.post.mockResolvedValue({
        data: { result: mockIntervals },
      });

      const result = await rpc.getCeremonyIntervals();

      expect(result).toEqual(mockIntervals);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'dna_ceremonyIntervals',
        }),
        expect.any(Object)
      );
    });
  });

  describe('getNetworkSize', () => {
    it('should return count of identities', async () => {
      const mockIdentities = [{ address: '0x1' }, { address: '0x2' }, { address: '0x3' }];
      axios.post.mockResolvedValue({
        data: { result: mockIdentities },
      });

      const result = await rpc.getNetworkSize();

      expect(result).toBe(3);
    });

    it('should return 0 when identities is null', async () => {
      axios.post.mockResolvedValue({
        data: { result: null },
      });

      const result = await rpc.getNetworkSize();

      expect(result).toBe(0);
    });
  });

  describe('getStake', () => {
    it('should return stake for identity', async () => {
      const mockIdentity = {
        address: '0x123',
        state: 'Human',
        stake: '1500.5',
      };
      axios.post.mockResolvedValue({
        data: { result: mockIdentity },
      });

      const result = await rpc.getStake('0x123');

      expect(result).toBe('1500.5');
    });

    it('should return null when identity not found', async () => {
      axios.post.mockResolvedValue({
        data: { result: null },
      });

      const result = await rpc.getStake('0x123');

      expect(result).toBeNull();
    });
  });

  describe('getBalance', () => {
    it('should fetch balance for address', async () => {
      const mockBalance = {
        balance: '1000.5',
        stake: '500.25',
      };
      axios.post.mockResolvedValue({
        data: { result: mockBalance },
      });

      const result = await rpc.getBalance('0x123');

      expect(result).toEqual(mockBalance);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'dna_getBalance',
          params: ['0x123'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getTransaction', () => {
    it('should fetch transaction by hash', async () => {
      const mockTx = {
        hash: '0xabc123',
        type: 'send',
        from: '0x123',
        to: '0x456',
        amount: '100',
      };
      axios.post.mockResolvedValue({
        data: { result: mockTx },
      });

      const result = await rpc.getTransaction('0xabc123');

      expect(result).toEqual(mockTx);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'bcn_transaction',
          params: ['0xabc123'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getBlockByHeight', () => {
    it('should fetch block by height', async () => {
      const mockBlock = {
        height: 12345,
        hash: '0xblock123',
        parentHash: '0xparent123',
        timestamp: 1234567890,
      };
      axios.post.mockResolvedValue({
        data: { result: mockBlock },
      });

      const result = await rpc.getBlockByHeight(12345);

      expect(result).toEqual(mockBlock);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'bcn_blockAt',
          params: [12345],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getBlockByHash', () => {
    it('should fetch block by hash', async () => {
      const mockBlock = {
        height: 12345,
        hash: '0xblock123',
        parentHash: '0xparent123',
        timestamp: 1234567890,
      };
      axios.post.mockResolvedValue({
        data: { result: mockBlock },
      });

      const result = await rpc.getBlockByHash('0xblock123');

      expect(result).toEqual(mockBlock);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'bcn_block',
          params: ['0xblock123'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('getNodeHealth', () => {
    it('should return healthy status when node responds', async () => {
      axios.post.mockResolvedValue({
        data: { result: { epoch: 100 } },
      });

      const health = await rpc.getNodeHealth();

      expect(health.healthy).toBe(true);
      expect(health).toHaveProperty('currentEpoch', 100);
      expect(health).toHaveProperty('timestamp');
    });

    it('should return unhealthy status when node fails', async () => {
      axios.post.mockRejectedValue(new Error('Connection refused'));

      const health = await rpc.getNodeHealth();

      expect(health.healthy).toBe(false);
      expect(health).toHaveProperty('error');
    });
  });

  describe('getFilteredIdentities', () => {
    const mockIdentities = [
      { address: '0x1', state: 'Human', stake: '1000' },
      { address: '0x2', state: 'Verified', stake: '500' },
      { address: '0x3', state: 'Human', stake: '2000' },
    ];

    it('should return empty array when identities is null', async () => {
      axios.post.mockResolvedValue({
        data: { result: null },
      });

      const result = await rpc.getFilteredIdentities();

      expect(result).toEqual([]);
    });

    it('should return all identities without filters', async () => {
      axios.post.mockResolvedValue({
        data: { result: mockIdentities },
      });

      const result = await rpc.getFilteredIdentities();

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
    });

    it('should filter by state', async () => {
      axios.post.mockResolvedValue({
        data: { result: mockIdentities },
      });

      const result = await rpc.getFilteredIdentities({
        states: ['Human'],
      });

      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data.every((i) => i.state === 'Human')).toBe(true);
    });

    it('should filter by minimum stake', async () => {
      axios.post.mockResolvedValue({
        data: { result: mockIdentities },
      });

      const result = await rpc.getFilteredIdentities({
        minStake: 1000,
      });

      expect(result.total).toBe(2);
      expect(result.data.every((i) => parseFloat(i.stake) >= 1000)).toBe(true);
    });

    it('should handle identities with null or undefined stake in minStake filter', async () => {
      const identitiesWithNullStake = [
        { address: '0x1', state: 'Human', stake: '1000' },
        { address: '0x2', state: 'Verified', stake: null },
        { address: '0x3', state: 'Human' }, // stake is undefined
        { address: '0x4', state: 'Newbie', stake: '500' },
      ];
      axios.post.mockResolvedValue({
        data: { result: identitiesWithNullStake },
      });

      const result = await rpc.getFilteredIdentities({
        minStake: 100,
      });

      // Only identities with stake >= 100 should be included
      // Null/undefined stake defaults to 0, which is < 100
      expect(result.total).toBe(2);
      expect(result.data).toEqual([
        { address: '0x1', state: 'Human', stake: '1000' },
        { address: '0x4', state: 'Newbie', stake: '500' },
      ]);
    });

    it('should paginate results', async () => {
      axios.post.mockResolvedValue({
        data: { result: mockIdentities },
      });

      const result = await rpc.getFilteredIdentities({
        limit: 2,
        offset: 1,
      });

      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
      expect(result.data).toHaveLength(2);
    });
  });
});
