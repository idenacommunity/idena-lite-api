// Mock the IdenaRPC class BEFORE requiring anything
jest.mock('../src/rpc', () => {
  return jest.fn().mockImplementation(() => ({
    getNodeHealth: jest.fn().mockResolvedValue({
      healthy: true,
      currentEpoch: 100,
      timestamp: new Date().toISOString(),
    }),
  }));
});

const request = require('supertest');
const app = require('../src/server');

describe('Health Endpoint', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/health').expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('api');
      expect(response.body.api).toHaveProperty('status');
      expect(response.body.api).toHaveProperty('version');
      expect(response.body.api).toHaveProperty('uptime');
      expect(response.body.api).toHaveProperty('timestamp');
    });

    it('should include cache status', async () => {
      const response = await request(app).get('/api/health');

      expect(response.body).toHaveProperty('cache');
      expect(response.body.cache).toHaveProperty('status');
      expect(response.body.cache).toHaveProperty('enabled');
    });

    it('should include node health', async () => {
      const response = await request(app).get('/api/health');

      expect(response.body).toHaveProperty('idenaNode');
      expect(response.body.idenaNode).toHaveProperty('healthy');
    });

    it('should return 503 when node is unhealthy', async () => {
      const IdenaRPC = require('../src/rpc');
      IdenaRPC.mockImplementation(() => ({
        getNodeHealth: jest.fn().mockResolvedValue({
          healthy: false,
          error: 'Connection refused',
          timestamp: new Date().toISOString(),
        }),
      }));

      // Need to re-import to get new mock
      jest.resetModules();
      jest.mock('../src/rpc', () => {
        return jest.fn().mockImplementation(() => ({
          getNodeHealth: jest.fn().mockResolvedValue({
            healthy: false,
            error: 'Connection refused',
            timestamp: new Date().toISOString(),
          }),
        }));
      });

      const appWithUnhealthyNode = require('../src/server');
      const response = await request(appWithUnhealthyNode).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.idenaNode.healthy).toBe(false);
    });

    it('should return 503 with error details when health check throws', async () => {
      jest.resetModules();
      jest.mock('../src/rpc', () => {
        return jest.fn().mockImplementation(() => ({
          getNodeHealth: jest.fn().mockRejectedValue(new Error('RPC connection failed')),
        }));
      });

      const appWithError = require('../src/server');
      const response = await request(appWithError).get('/api/health');

      expect(response.status).toBe(503);
      expect(response.body.api.status).toBe('error');
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/ping', () => {
    it('should respond with pong', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('pong', true);
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return timestamp in ISO format', async () => {
      const response = await request(app).get('/api/ping');

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(timestamp).toString()).not.toBe('Invalid Date');
    });
  });
});
