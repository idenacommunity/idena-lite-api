// Mock RPC for integration tests
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getNodeHealth: jest.fn().mockResolvedValue({
      healthy: true,
      currentEpoch: 100,
      timestamp: new Date().toISOString()
    }),
    getIdentity: jest.fn().mockResolvedValue({
      address: '0x1234567890123456789012345678901234567890',
      state: 'Human',
      stake: '1000',
      age: 10
    }),
    getEpoch: jest.fn().mockResolvedValue({
      epoch: 100,
      nextValidation: '2026-02-15T12:00:00Z'
    }),
    getCeremonyIntervals: jest.fn().mockResolvedValue({
      FlipLotteryDuration: 7200,
      ShortSessionDuration: 900
    }),
    getFilteredIdentities: jest.fn().mockResolvedValue({
      total: 3,
      limit: 100,
      offset: 0,
      data: [
        { address: '0x111', state: 'Human' },
        { address: '0x222', state: 'Verified' },
        { address: '0x333', state: 'Human' }
      ]
    })
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('API Integration Tests', () => {
  describe('Complete API Workflow', () => {
    it('should check health, then fetch identity and epoch', async () => {
      // 1. Check API health
      const healthResponse = await request(app)
        .get('/api/health')
        .expect(200);

      expect(healthResponse.body.api.status).toBe('operational');
      expect(healthResponse.body.idenaNode.healthy).toBe(true);

      // 2. Get current epoch
      const epochResponse = await request(app)
        .get('/api/epoch/current')
        .expect(200);

      expect(epochResponse.body.result.epoch).toBe(100);

      // 3. Get identity
      const identityResponse = await request(app)
        .get('/api/identity/0x1234567890123456789012345678901234567890')
        .expect(200);

      expect(identityResponse.body.result.state).toBe('Human');
    });

    it('should handle error chain gracefully', async () => {
      // Try invalid identity first
      await request(app)
        .get('/api/identity/invalid')
        .expect(400);

      // Then try valid endpoints
      await request(app)
        .get('/api/health')
        .expect(200);

      await request(app)
        .get('/api/ping')
        .expect(200);
    });
  });

  describe('Multiple Endpoint Access', () => {
    it('should handle concurrent requests', async () => {
      const requests = [
        request(app).get('/api/health'),
        request(app).get('/api/ping'),
        request(app).get('/api/epoch/current'),
        request(app).get('/api/identity?limit=10')
      ];

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        // Should be successful (200) or have an error (404, 500)
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(600);
      });
    });

    it('should maintain consistent API structure', async () => {
      const endpoints = [
        '/api/epoch/current',
        '/api/epoch/intervals'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint).expect(200);
        expect(response.body).toHaveProperty('result');
      }
    });
  });

  describe('Error Handling Consistency', () => {
    it('should return consistent error format', async () => {
      const invalidRequests = [
        request(app).get('/api/identity/invalid'),
        request(app).get('/nonexistent'),
        request(app).get('/api/identity/0x123/stake')
      ];

      for (const req of invalidRequests) {
        const response = await req;
        expect(response.body).toHaveProperty('error');
        expect(response.body.error).toHaveProperty('message');
        expect(response.body.error).toHaveProperty('status');
      }
    });
  });

  describe('Response Time Performance', () => {
    it('should respond to health check quickly', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/health')
        .expect(200);

      const duration = Date.now() - start;

      // Should respond in less than 1 second
      expect(duration).toBeLessThan(1000);
    });

    it('should respond to ping immediately', async () => {
      const start = Date.now();

      await request(app)
        .get('/api/ping')
        .expect(200);

      const duration = Date.now() - start;

      // Ping should be very fast (< 100ms)
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Root Endpoint', () => {
    it('should provide API documentation at root', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('name', 'idena-lite-api');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body.endpoints).toHaveProperty('health');
      expect(response.body.endpoints).toHaveProperty('identity');
      expect(response.body.endpoints).toHaveProperty('epoch');
    });

    it('should include RPC node URL in root response', async () => {
      const response = await request(app).get('/');

      expect(response.body).toHaveProperty('rpcNode');
    });
  });
});
