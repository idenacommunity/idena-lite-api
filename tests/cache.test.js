const { Cache } = require('../src/cache');

// Mock redis
const mockOn = jest.fn();
const mockConnect = jest.fn();
const mockGet = jest.fn();
const mockSetEx = jest.fn();
const mockDel = jest.fn();
const mockFlushAll = jest.fn();
const mockQuit = jest.fn();

jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: mockConnect,
    get: mockGet,
    setEx: mockSetEx,
    del: mockDel,
    flushAll: mockFlushAll,
    quit: mockQuit,
    on: mockOn,
  })),
}));

describe('Cache Service', () => {
  let cache;
  let mockClient;
  const redis = require('redis');

  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(null);
    mockSetEx.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockFlushAll.mockResolvedValue(undefined);
    mockQuit.mockResolvedValue(undefined);

    // Enable cache for testing
    process.env.REDIS_ENABLED = 'true';

    cache = new Cache();
    mockClient = redis.createClient();
    cache.client = mockClient;
    cache.enabled = true;
  });

  afterEach(() => {
    process.env.REDIS_ENABLED = 'false';
    // Reset createClient mock to default implementation
    redis.createClient.mockImplementation(() => ({
      connect: mockConnect,
      get: mockGet,
      setEx: mockSetEx,
      del: mockDel,
      flushAll: mockFlushAll,
      quit: mockQuit,
      on: mockOn,
    }));
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
      delete process.env.CACHE_TTL;
    });

    it('should use default TTL of 300 when CACHE_TTL is not set', () => {
      const originalTTL = process.env.CACHE_TTL;
      delete process.env.CACHE_TTL;

      const newCache = new Cache();
      expect(newCache.defaultTTL).toBe(300);

      // Restore original value
      if (originalTTL !== undefined) {
        process.env.CACHE_TTL = originalTTL;
      }
    });
  });

  describe('connect', () => {
    it('should return early when cache is disabled', async () => {
      const newCache = new Cache();
      newCache.enabled = false;

      // Clear mocks from beforeEach
      redis.createClient.mockClear();

      await newCache.connect();

      expect(redis.createClient).not.toHaveBeenCalled();
    });

    it('should create Redis client with correct configuration', async () => {
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(redis.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.any(String),
          socket: expect.objectContaining({
            reconnectStrategy: expect.any(Function),
          }),
        })
      );
    });

    it('should register error and connect event handlers', async () => {
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(mockOn).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('should call client.connect()', async () => {
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(mockConnect).toHaveBeenCalled();
    });

    it('should handle connection failure gracefully', async () => {
      mockConnect.mockRejectedValue(new Error('Connection refused'));
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(newCache.enabled).toBe(false);
    });

    it('should use REDIS_URL from environment', async () => {
      process.env.REDIS_URL = 'redis://custom-host:6380';
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(redis.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'redis://custom-host:6380',
        })
      );
      // Reset
      delete process.env.REDIS_URL;
    });

    it('should use default REDIS_URL when not set', async () => {
      delete process.env.REDIS_URL;
      const newCache = new Cache();
      newCache.enabled = true;

      await newCache.connect();

      expect(redis.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'redis://localhost:6379',
        })
      );
    });

    describe('reconnectStrategy', () => {
      it('should return delay based on retry count', async () => {
        let capturedStrategy;
        redis.createClient.mockImplementation((config) => {
          capturedStrategy = config.socket.reconnectStrategy;
          return {
            connect: mockConnect,
            on: mockOn,
          };
        });

        const newCache = new Cache();
        newCache.enabled = true;
        await newCache.connect();

        // Test retry delays
        expect(capturedStrategy(1)).toBe(100);
        expect(capturedStrategy(5)).toBe(500);
        expect(capturedStrategy(10)).toBe(1000);
      });

      it('should return Error after 10 retries', async () => {
        let capturedStrategy;
        redis.createClient.mockImplementation((config) => {
          capturedStrategy = config.socket.reconnectStrategy;
          return {
            connect: mockConnect,
            on: mockOn,
          };
        });

        const newCache = new Cache();
        newCache.enabled = true;
        await newCache.connect();

        const result = capturedStrategy(11);
        expect(result).toBeInstanceOf(Error);
        expect(result.message).toBe('Redis connection failed');
      });
    });

    describe('event handlers', () => {
      it('should log error on Redis error event', async () => {
        let errorHandler;
        mockOn.mockImplementation((event, handler) => {
          if (event === 'error') {
            errorHandler = handler;
          }
        });

        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const newCache = new Cache();
        newCache.enabled = true;
        await newCache.connect();

        // Trigger error handler
        errorHandler(new Error('Redis connection lost'));

        expect(consoleSpy).toHaveBeenCalledWith('Redis error:', expect.any(Error));
        consoleSpy.mockRestore();
      });

      it('should log success on Redis connect event', async () => {
        let connectHandler;
        mockOn.mockImplementation((event, handler) => {
          if (event === 'connect') {
            connectHandler = handler;
          }
        });

        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        const newCache = new Cache();
        newCache.enabled = true;
        await newCache.connect();

        // Trigger connect handler
        connectHandler();

        expect(consoleSpy).toHaveBeenCalledWith('✅ Redis connected');
        consoleSpy.mockRestore();
      });
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

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 300, JSON.stringify(data));
    });

    it('should store value with custom TTL', async () => {
      const data = { test: 'data' };
      await cache.set('test-key', data, 600);

      expect(mockClient.setEx).toHaveBeenCalledWith('test-key', 600, JSON.stringify(data));
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
