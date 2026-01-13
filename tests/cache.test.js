const { Cache } = require('../src/cache');

// Mock redis
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    flushAll: jest.fn(),
    quit: jest.fn(),
    on: jest.fn()
  }))
}));

describe('Cache Service', () => {
  let cache;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Enable cache for testing
    process.env.REDIS_ENABLED = 'true';
    
    cache = new Cache();
    mockClient = require('redis').createClient();
    cache.client = mockClient;
    cache.enabled = true;
  });

  afterEach(async () => {
    process.env.REDIS_ENABLED = 'false';
  });

  describe('constructor', () => {
    it('should initialize with default settings', () => {
      const newCache = new Cache();
      expect(newCache.client).toBeNull();
      expect(newCache.defaultTTL).toBe(300);
    });

    it('should respect REDIS_ENABLED env variable', () => {
      process.env.REDIS_ENABLED = 'false';
      const newCache = new Cache();
      expect(newCache.enabled).toBe(false);
    });

    it('should respect CACHE_TTL env variable', () => {
      process.env.CACHE_TTL = '600';
      const newCache = new Cache();
      expect(newCache.defaultTTL).toBe(600);
      // Reset for other tests
      process.env.CACHE_TTL = '300';
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      cache.enabled = false;
      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should return null when client is not connected', async () => {
      cache.client = null;
      const result = await cache.get('test-key');
      expect(result).toBeNull();
    });

    it('should retrieve and parse cached value', async () => {
      const mockData = { test: 'data' };
      mockClient.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await cache.get('test-key');

      expect(mockClient.get).toHaveBeenCalledWith('test-key');
      expect(result).toEqual(mockData);
    });

    it('should return null when key does not exist', async () => {
      mockClient.get.mockResolvedValue(null);

      const result = await cache.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      mockClient.get.mockRejectedValue(new Error('Redis error'));

      const result = await cache.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should do nothing when cache is disabled', async () => {
      cache.enabled = false;
      await cache.set('key', 'value');
      expect(mockClient.setEx).not.toHaveBeenCalled();
    });

    it('should do nothing when client is not connected', async () => {
      cache.client = null;
      await cache.set('key', 'value');
      expect(mockClient.setEx).not.toHaveBeenCalled();
    });

    it('should store value with default TTL', async () => {
      const data = { test: 'data' };
      await cache.set('test-key', data);

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'test-key',
        300,
        JSON.stringify(data)
      );
    });

    it('should store value with custom TTL', async () => {
      const data = { test: 'data' };
      await cache.set('test-key', data, 600);

      expect(mockClient.setEx).toHaveBeenCalledWith(
        'test-key',
        600,
        JSON.stringify(data)
      );
    });

    it('should handle errors gracefully', async () => {
      mockClient.setEx.mockRejectedValue(new Error('Redis error'));

      await expect(cache.set('key', 'value')).resolves.not.toThrow();
    });
  });

  describe('delete', () => {
    it('should do nothing when cache is disabled', async () => {
      cache.enabled = false;
      await cache.delete('key');
      expect(mockClient.del).not.toHaveBeenCalled();
    });

    it('should delete key from cache', async () => {
      await cache.delete('test-key');

      expect(mockClient.del).toHaveBeenCalledWith('test-key');
    });

    it('should handle errors gracefully', async () => {
      mockClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(cache.delete('key')).resolves.not.toThrow();
    });
  });

  describe('flush', () => {
    it('should do nothing when cache is disabled', async () => {
      cache.enabled = false;
      await cache.flush();
      expect(mockClient.flushAll).not.toHaveBeenCalled();
    });

    it('should flush all keys', async () => {
      await cache.flush();

      expect(mockClient.flushAll).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockClient.flushAll.mockRejectedValue(new Error('Redis error'));

      await expect(cache.flush()).resolves.not.toThrow();
    });
  });

  describe('disconnect', () => {
    it('should quit client connection', async () => {
      await cache.disconnect();

      expect(mockClient.quit).toHaveBeenCalled();
    });

    it('should handle null client', async () => {
      cache.client = null;
      await expect(cache.disconnect()).resolves.not.toThrow();
    });
  });

  describe('generateKey', () => {
    it('should generate cache key from parts', () => {
      const key = cache.generateKey('identity', '0x123', 'data');
      expect(key).toBe('identity:0x123:data');
    });

    it('should handle single part', () => {
      const key = cache.generateKey('health');
      expect(key).toBe('health:');
    });

    it('should handle multiple parts', () => {
      const key = cache.generateKey('epoch', '100', 'current', 'data');
      expect(key).toBe('epoch:100:current:data');
    });
  });
});
