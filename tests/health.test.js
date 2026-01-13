const request = require('supertest');
const app = require('../src/server');

describe('Health Endpoint', () => {
  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect('Content-Type', /json/);
      
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
