const redis = require('redis');

class Cache {
  constructor() {
    this.client = null;
    this.enabled = process.env.REDIS_ENABLED !== 'false';
    this.defaultTTL = parseInt(process.env.CACHE_TTL || '300'); // 5 minutes default
  }

  async connect() {
    if (!this.enabled) {
      console.log('⚠️  Cache disabled');
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = redis.createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Redis connection failed after 10 retries');
              return new Error('Redis connection failed');
            }
            return retries * 100;
          },
        },
      });

      this.client.on('error', (err) => {
        console.error('Redis error:', err);
      });

      this.client.on('connect', () => {
        console.log('✅ Redis connected');
      });

      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error.message);
      console.log('⚠️  Running without cache');
      this.enabled = false;
    }
  }

  async get(key) {
    if (!this.enabled || !this.client) {
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        return JSON.parse(value);
      }
      return null;
    } catch (error) {
      console.error('Cache get error:', error.message);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error.message);
    }
  }

  async delete(key) {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error.message);
    }
  }

  async flush() {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      await this.client.flushAll();
      console.log('Cache flushed');
    } catch (error) {
      console.error('Cache flush error:', error.message);
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
    }
  }

  // Helper: Generate cache key
  generateKey(prefix, ...parts) {
    return `${prefix}:${parts.join(':')}`;
  }
}

// Singleton instance
const cache = new Cache();
cache.connect();

module.exports = cache;
module.exports.Cache = Cache;
