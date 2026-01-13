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
  });

  describe('call method', () => {
    it('should make successful RPC call', async () => {
      const mockResult = { epoch: 100 };
      axios.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          result: mockResult,
          id: 1
        }
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
            message: 'Method not found'
          },
          id: 1
        }
      });

      await expect(rpc.call('invalid_method')).rejects.toThrow('Method not found');
    });

    it('should handle network errors', async () => {
      axios.post.mockRejectedValue(new Error('Network timeout'));

      await expect(rpc.call('dna_epoch')).rejects.toThrow('Network error');
    });
  });

  describe('getIdentity', () => {
    it('should fetch identity by address', async () => {
      const mockIdentity = {
        address: '0x123',
        state: 'Human',
        stake: '1000'
      };

      axios.post.mockResolvedValue({
        data: { result: mockIdentity }
      });

      const result = await rpc.getIdentity('0x123');
      
      expect(result).toEqual(mockIdentity);
      expect(axios.post).toHaveBeenCalledWith(
        'http://test-node:9009',
        expect.objectContaining({
          method: 'dna_identity',
          params: ['0x123']
        }),
        expect.any(Object)
      );
    });
  });

  describe('getEpoch', () => {
    it('should fetch current epoch', async () => {
      const mockEpoch = { epoch: 100 };
      axios.post.mockResolvedValue({
        data: { result: mockEpoch }
      });

      const result = await rpc.getEpoch();
      
      expect(result).toEqual(mockEpoch);
    });
  });

  describe('getNodeHealth', () => {
    it('should return healthy status when node responds', async () => {
      axios.post.mockResolvedValue({
        data: { result: { epoch: 100 } }
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
      { address: '0x3', state: 'Human', stake: '2000' }
    ];

    beforeEach(() => {
      axios.post.mockResolvedValue({
        data: { result: mockIdentities }
      });
    });

    it('should return all identities without filters', async () => {
      const result = await rpc.getFilteredIdentities();
      
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(3);
    });

    it('should filter by state', async () => {
      const result = await rpc.getFilteredIdentities({
        states: ['Human']
      });
      
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.data.every(i => i.state === 'Human')).toBe(true);
    });

    it('should filter by minimum stake', async () => {
      const result = await rpc.getFilteredIdentities({
        minStake: 1000
      });
      
      expect(result.total).toBe(2);
      expect(result.data.every(i => parseFloat(i.stake) >= 1000)).toBe(true);
    });

    it('should paginate results', async () => {
      const result = await rpc.getFilteredIdentities({
        limit: 2,
        offset: 1
      });
      
      expect(result.limit).toBe(2);
      expect(result.offset).toBe(1);
      expect(result.data).toHaveLength(2);
    });
  });
});
