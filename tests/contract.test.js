/**
 * Tests for Contract Routes
 */

// Mock the RPC module
const mockCall = jest.fn();
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    call: mockCall,
  }));
});

// Mock the database module
jest.mock('../src/db', () => ({
  enabled: true,
  getStats: jest.fn().mockReturnValue({ enabled: true }),
  getContract: jest.fn(),
  getContracts: jest.fn(),
  getContractsByDeployer: jest.fn(),
  getContractCalls: jest.fn(),
  getContractCallsByAddress: jest.fn(),
  getContractStats: jest.fn(),
  insertContract: jest.fn(),
  insertContractCall: jest.fn(),
  updateContractState: jest.fn(),
  init: jest.fn(),
}));

// Mock the sync service
jest.mock('../src/sync', () => ({
  getStatus: jest.fn().mockReturnValue({ enabled: true }),
  start: jest.fn(),
  stop: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const historyDB = require('../src/db');

describe('Contract Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    historyDB.enabled = true;
  });

  describe('GET /api/contract', () => {
    it('should return all contracts', async () => {
      historyDB.getContracts.mockReturnValue({
        data: [
          {
            address: '0xcontract1',
            deployer: '0xdeployer1',
            state: 'active',
            epoch: 100,
          },
        ],
        total: 1,
        hasMore: false,
      });

      const response = await request(app)
        .get('/api/contract')
        .expect(200);

      expect(response.body.result.data).toHaveLength(1);
      expect(response.body.result.data[0].address).toBe('0xcontract1');
    });

    it('should filter by state', async () => {
      historyDB.getContracts.mockReturnValue({
        data: [],
        total: 0,
        hasMore: false,
      });

      await request(app)
        .get('/api/contract?state=active')
        .expect(200);

      expect(historyDB.getContracts).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'active' })
      );
    });

    it('should filter by deployer', async () => {
      historyDB.getContracts.mockReturnValue({
        data: [],
        total: 0,
        hasMore: false,
      });

      await request(app)
        .get('/api/contract?deployer=0xdeployer1')
        .expect(200);

      expect(historyDB.getContracts).toHaveBeenCalledWith(
        expect.objectContaining({ deployer: '0xdeployer1' })
      );
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get('/api/contract')
        .expect(503);

      expect(response.body.error.code).toBe('CONTRACTS_UNAVAILABLE');
    });
  });

  describe('GET /api/contract/stats', () => {
    it('should return contract statistics', async () => {
      historyDB.getContractStats.mockReturnValue({
        contracts: {
          total: 100,
          active: 80,
          terminated: 20,
          uniqueDeployers: 50,
          totalStake: '1000000',
        },
        calls: {
          total: 5000,
          uniqueCallers: 200,
          contractsCalled: 75,
          totalAmount: '500000',
        },
        topContracts: [
          { address: '0xcontract1', callCount: 1000 },
        ],
      });

      const response = await request(app)
        .get('/api/contract/stats')
        .expect(200);

      expect(response.body.result.contracts.total).toBe(100);
      expect(response.body.result.calls.total).toBe(5000);
      expect(response.body.result.topContracts).toHaveLength(1);
    });
  });

  describe('GET /api/contract/:address', () => {
    it('should return contract by address', async () => {
      historyDB.getContract.mockReturnValue({
        address: '0xcontract1',
        deployTxHash: '0xtx1',
        deployer: '0xdeployer1',
        state: 'active',
        epoch: 100,
        blockHeight: 5000000,
        timestamp: 1234567890,
      });

      const response = await request(app)
        .get('/api/contract/0xcontract1')
        .expect(200);

      expect(response.body.result.address).toBe('0xcontract1');
      expect(response.body.result.deployer).toBe('0xdeployer1');
    });

    it('should return 404 for non-existent contract', async () => {
      historyDB.getContract.mockReturnValue(null);

      const response = await request(app)
        .get('/api/contract/0xnonexistent')
        .expect(404);

      expect(response.body.error.code).toBe('CONTRACT_NOT_FOUND');
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/contract/invalid')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('GET /api/contract/:address/calls', () => {
    it('should return contract calls', async () => {
      historyDB.getContractCalls.mockReturnValue({
        data: [
          {
            txHash: '0xtx1',
            caller: '0xcaller1',
            method: 'transfer',
            amount: '100',
            success: true,
          },
        ],
        total: 1,
        hasMore: false,
      });

      const response = await request(app)
        .get('/api/contract/0xcontract1/calls')
        .expect(200);

      expect(response.body.result.data).toHaveLength(1);
      expect(response.body.result.data[0].method).toBe('transfer');
    });

    it('should filter by method', async () => {
      historyDB.getContractCalls.mockReturnValue({
        data: [],
        total: 0,
        hasMore: false,
      });

      await request(app)
        .get('/api/contract/0xcontract1/calls?method=transfer')
        .expect(200);

      expect(historyDB.getContractCalls).toHaveBeenCalledWith(
        '0xcontract1',
        expect.objectContaining({ method: 'transfer' })
      );
    });

    it('should filter by caller', async () => {
      historyDB.getContractCalls.mockReturnValue({
        data: [],
        total: 0,
        hasMore: false,
      });

      await request(app)
        .get('/api/contract/0xcontract1/calls?caller=0xcaller1')
        .expect(200);

      expect(historyDB.getContractCalls).toHaveBeenCalledWith(
        '0xcontract1',
        expect.objectContaining({ caller: '0xcaller1' })
      );
    });
  });

  describe('GET /api/contract/deployer/:address', () => {
    it('should return contracts by deployer', async () => {
      historyDB.getContractsByDeployer.mockReturnValue({
        data: [
          { address: '0xcontract1', deployer: '0xdeployer1' },
          { address: '0xcontract2', deployer: '0xdeployer1' },
        ],
        total: 2,
        hasMore: false,
      });

      const response = await request(app)
        .get('/api/contract/deployer/0xdeployer1')
        .expect(200);

      expect(response.body.result.data).toHaveLength(2);
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/contract/deployer/invalid')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });
  });

  describe('GET /api/contract/caller/:address', () => {
    it('should return contract calls by caller', async () => {
      historyDB.getContractCallsByAddress.mockReturnValue({
        data: [
          {
            txHash: '0xtx1',
            contractAddress: '0xcontract1',
            caller: '0xcaller1',
            method: 'transfer',
          },
        ],
        total: 1,
        hasMore: false,
      });

      const response = await request(app)
        .get('/api/contract/caller/0xcaller1')
        .expect(200);

      expect(response.body.result.data).toHaveLength(1);
      expect(response.body.result.data[0].caller).toBe('0xcaller1');
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/contract/caller/invalid')
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ADDRESS');
    });
  });
});

// Note: Database-level tests for contracts are in db.test.js
