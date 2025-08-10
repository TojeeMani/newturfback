const redis = require('redis');
const dotenv = require('dotenv');

dotenv.config();

let redisClient = null;
let redisAvailable = false;

// Create Redis client with updated configuration for Redis v4+
const createRedisClient = () => {
  const client = redis.createClient({
    socket: {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      reconnectStrategy: false, // Disable automatic reconnection
      connectTimeout: 3000, // 3 second timeout
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  // Handle Redis connection events
  client.on('connect', () => {
    console.log('Connected to Redis');
    redisAvailable = true;
  });

  client.on('error', () => {
    // Only log once to avoid spam
    if (redisAvailable) {
      console.log('Redis connection lost. OTP functionality will be disabled.');
      redisAvailable = false;
    }
  });

  return client;
};

// Connect to Redis with error handling
const connectRedis = async () => {
  try {
    redisClient = createRedisClient();

    // Set a connection timeout to avoid hanging
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Redis connection timeout')), 3000);
    });

    await Promise.race([connectPromise, timeoutPromise]);
    redisAvailable = true;
    console.log('Redis connected successfully');
  } catch (error) {
    console.log('Redis is not available. OTP functionality will be disabled.');
    redisAvailable = false;
    redisClient = null;
  }
};

// Initialize Redis connection only if Redis is explicitly enabled
if (process.env.REDIS_ENABLED === 'true') {
  connectRedis();
} else {
  console.log('Redis is disabled. OTP functionality will not be available.');
}

// Create a wrapper object that handles Redis operations gracefully
const redisWrapper = {
  async setEx(key, seconds, value) {
    if (!redisAvailable || !redisClient) {
      throw new Error('Redis not available');
    }
    return await redisClient.setEx(key, seconds, value);
  },

  async get(key) {
    if (!redisAvailable || !redisClient) {
      throw new Error('Redis not available');
    }
    return await redisClient.get(key);
  },

  async del(key) {
    if (!redisAvailable || !redisClient) {
      throw new Error('Redis not available');
    }
    return await redisClient.del(key);
  },

  isAvailable() {
    return redisAvailable;
  }
};

module.exports = redisWrapper;