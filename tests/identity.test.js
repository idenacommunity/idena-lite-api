// Create mock functions that will be reused
const mockGetIdentity = jest.fn();
const mockGetFilteredIdentities = jest.fn();

// Mock the RPC module BEFORE any imports
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getIdentity: mockGetIdentity,
    getFilteredIdentities: mockGetFilteredIdentities
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Identity Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/identity/:address', () => {
    const validAddress = '0x1234567890123456789012345678901234567890';

    it('should return identity for valid address', async () => {
      const mockIdentity = {
        address: validAddress,
        state: 'Human',
        stake: '1000',
        age: 10
      };
      mockGetIdentity.mockResolvedValueOnce(mockIdentity);

      const response = await request(app)
        .get('/api/identity/' + validAddress)
        .expect(200);

      expect(response.body).toHaveProperty('result');
      expect(mockGetIdentity).toHaveBeenCalledWith(validAddress);
    });

    it('should reject invalid address format - too short', async () => {
      const response = await request(app)
        .get('/api/identity/0x123')
        .expect(400);

      expect(response.body.error.message).toContain('Invalid Idena address');
    });

    it('should return 404 when identity not found', async () => {
      mockGetIdentity.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/identity/' + validAddress)
        .expect(404);

      expect(response.body.error.message).toBe('Identity not found');
    });
  });

  describe('GET /api/identity/:address/stake', () => {
    const validAddress = '0x1234567890123456789012345678901234567890';

    it('should return stake for valid address', async () => {
      mockGetIdentity.mockResolvedValueOnce({
        address: validAddress,
        state: 'Human',
        stake: '1500.5'
      });

      const response = await request(app)
        .get('/api/identity/' + validAddress + '/stake')
        .expect(200);

      expect(response.body).toHaveProperty('stake', '1500.5');
      expect(response.body).toHaveProperty('unit', 'iDNA');
    });

    it('should return 0 stake when identity has no stake', async () => {
      mockGetIdentity.mockResolvedValueOnce({
        address: validAddress,
        state: 'Newbie',
        stake: null
      });

      const response = await request(app)
        .get('/api/identity/' + validAddress + '/stake')
        .expect(200);

      expect(response.body.stake).toBe('0');
    });
  });

  describe('GET /api/identity/ (list identities)', () => {
    it('should return paginated identities', async () => {
      mockGetFilteredIdentities.mockResolvedValueOnce({
        total: 3,
        limit: 100,
        offset: 0,
        data: [
          { address: '0x111', state: 'Human' },
          { address: '0x222', state: 'Verified' }
        ]
      });

      const response = await request(app)
        .get('/api/identity?limit=100&offset=0')
        .expect(200);

      expect(response.body).toHaveProperty('total', 3);
      expect(response.body.data).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      mockGetFilteredIdentities.mockResolvedValueOnce({
        total: 10,
        limit: 5,
        offset: 0,
        data: []
      });

      await request(app)
        .get('/api/identity?limit=5')
        .expect(200);

      expect(mockGetFilteredIdentities).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5 })
      );
    });

    it('should enforce maximum limit of 1000', async () => {
      mockGetFilteredIdentities.mockResolvedValueOnce({
        total: 0,
        limit: 1000,
        offset: 0,
        data: []
      });

      await request(app)
        .get('/api/identity?limit=5000')
        .expect(200);

      expect(mockGetFilteredIdentities).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1000 })
      );
    });

    it('should filter by states', async () => {
      mockGetFilteredIdentities.mockResolvedValueOnce({
        total: 1,
        limit: 100,
        offset: 0,
        data: []
      });

      await request(app)
        .get('/api/identity?states=Human,Verified')
        .expect(200);

      expect(mockGetFilteredIdentities).toHaveBeenCalledWith(
        expect.objectContaining({ states: ['Human', 'Verified'] })
      );
    });
  });
});
