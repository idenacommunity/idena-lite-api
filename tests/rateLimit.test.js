const request = require('supertest');
const app = require('../src/server');

describe('Rate Limiting', () => {
  // Note: Rate limiter is configured for 100 requests per minute
  // We test with a smaller number to avoid timeout issues

  it('should allow requests under rate limit', async () => {
    // Make 10 requests quickly
    const requests = Array(10)
      .fill()
      .map(() => request(app).get('/api/ping'));

    const responses = await Promise.all(requests);

    // All should succeed
    responses.forEach((response) => {
      expect(response.status).toBe(200);
    });
  });

  it('should have rate limit headers', async () => {
    const response = await request(app).get('/api/ping');

    expect(response.headers).toHaveProperty('x-ratelimit-limit');
    expect(response.headers).toHaveProperty('x-ratelimit-remaining');
  });

  it('should count down remaining requests', async () => {
    const response1 = await request(app).get('/api/ping');
    const remaining1 = parseInt(response1.headers['x-ratelimit-remaining']);

    const response2 = await request(app).get('/api/ping');
    const remaining2 = parseInt(response2.headers['x-ratelimit-remaining']);

    expect(remaining2).toBeLessThan(remaining1);
  });

  it('should reset after time window', async () => {
    const response = await request(app).get('/api/ping');
    const resetTime = parseInt(response.headers['x-ratelimit-reset']);
    const currentTime = Math.floor(Date.now() / 1000);

    // Reset time should be in the future
    expect(resetTime).toBeGreaterThan(currentTime);
    // Reset time should be within next minute (60 seconds + 2s buffer for timing)
    expect(resetTime).toBeLessThanOrEqual(currentTime + 62);
  });
});
