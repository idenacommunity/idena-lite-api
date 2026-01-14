// Mock the database module
const mockGetAddressInfo = jest.fn();
const mockGetAddressBalanceChanges = jest.fn();
const mockGetAddressPenalties = jest.fn();

jest.mock('../src/db', () => ({
  enabled: true,
  getAddressInfo: mockGetAddressInfo,
  getAddressBalanceChanges: mockGetAddressBalanceChanges,
  getAddressPenalties: mockGetAddressPenalties,
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

describe('Address Routes', () => {
  const validAddress = '0x1234567890abcdef1234567890abcdef12345678';

  beforeEach(() => {
    jest.clearAllMocks();
    historyDB.enabled = true;
  });

  describe('GET /api/address/:address', () => {
    it('should return full address info', async () => {
      const mockInfo = {
        address: validAddress,
        balance: '1000.5',
        stake: '500.25',
        epoch: 150,
        identityState: 'Human',
        prevIdentityState: 'Verified',
        txSent: 100,
        txReceived: 50,
        txTotal: 150,
        totalRewards: '2500.0',
        totalPenalties: '10.0',
      };
      mockGetAddressInfo.mockReturnValue(mockInfo);

      const response = await request(app)
        .get(`/api/address/${validAddress}`)
        .expect(200);

      expect(response.body.result).toEqual(mockInfo);
      expect(mockGetAddressInfo).toHaveBeenCalledWith(validAddress);
    });

    it('should return 400 for invalid address format', async () => {
      const response = await request(app)
        .get('/api/address/invalid')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 404 when address not found', async () => {
      mockGetAddressInfo.mockReturnValue(null);

      const response = await request(app)
        .get(`/api/address/${validAddress}`)
        .expect(404);

      expect(response.body.error.message).toContain('not found');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      const response = await request(app)
        .get(`/api/address/${validAddress}`)
        .expect(503);

      expect(response.body.error.message).toContain('not enabled');
    });
  });

  describe('GET /api/address/:address/balance/changes', () => {
    it('should return balance changes', async () => {
      const mockResult = {
        data: [
          { blockHeight: 1002, txHash: '0xtx3', changeType: 'reward', amount: '10', balanceAfter: '110' },
          { blockHeight: 1001, txHash: '0xtx2', changeType: 'tx_out', amount: '50', balanceAfter: '100' },
          { blockHeight: 1000, txHash: '0xtx1', changeType: 'tx_in', amount: '150', balanceAfter: '150' },
        ],
        total: 100,
        limit: 50,
        offset: 0,
        hasMore: true,
      };
      mockGetAddressBalanceChanges.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/address/${validAddress}/balance/changes`)
        .expect(200);

      expect(response.body.data.length).toBe(3);
      expect(response.body.total).toBe(100);
      expect(mockGetAddressBalanceChanges).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetAddressBalanceChanges.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/address/${validAddress}/balance/changes?limit=25&offset=50`)
        .expect(200);

      expect(mockGetAddressBalanceChanges).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 25, offset: 50 })
      );
    });

    it('should support type filter', async () => {
      mockGetAddressBalanceChanges.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/address/${validAddress}/balance/changes?type=reward`)
        .expect(200);

      expect(mockGetAddressBalanceChanges).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ changeType: 'reward' })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/address/invalid/balance/changes')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/address/${validAddress}/balance/changes`)
        .expect(503);
    });
  });

  describe('GET /api/address/:address/penalties', () => {
    it('should return address penalties', async () => {
      const mockResult = {
        data: [
          { epoch: 150, penalty: '50', reason: 'bad_flip', blockHeight: 1000, timestamp: 1704067200 },
          { epoch: 149, penalty: '30', reason: 'missed_validation', blockHeight: 900, timestamp: 1704000000 },
        ],
        total: 10,
        limit: 50,
        offset: 0,
        hasMore: false,
      };
      mockGetAddressPenalties.mockReturnValue(mockResult);

      const response = await request(app)
        .get(`/api/address/${validAddress}/penalties`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      expect(response.body.total).toBe(10);
      expect(mockGetAddressPenalties).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 50, offset: 0 })
      );
    });

    it('should support pagination', async () => {
      mockGetAddressPenalties.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/address/${validAddress}/penalties?limit=10&offset=20`)
        .expect(200);

      expect(mockGetAddressPenalties).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });

    it('should support epoch filter', async () => {
      mockGetAddressPenalties.mockReturnValue({ data: [], total: 0, hasMore: false });

      await request(app)
        .get(`/api/address/${validAddress}/penalties?epoch=150`)
        .expect(200);

      expect(mockGetAddressPenalties).toHaveBeenCalledWith(
        validAddress,
        expect.objectContaining({ epoch: 150 })
      );
    });

    it('should return 400 for invalid address', async () => {
      const response = await request(app)
        .get('/api/address/invalid/penalties')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid address format');
    });

    it('should return 503 when history is disabled', async () => {
      historyDB.enabled = false;

      await request(app)
        .get(`/api/address/${validAddress}/penalties`)
        .expect(503);
    });
  });
});
