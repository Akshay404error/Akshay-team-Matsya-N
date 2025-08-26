const redis = require('redis');
const logger = require('../utils/logger');

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  
  // Connection options
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
};

// Create Redis clients
const createRedisClient = (dbNumber = 0) => {
  const client = redis.createClient({
    socket: {
      host: redisConfig.host,
      port: redisConfig.port,
      keepAlive: redisConfig.keepAlive
    },
    password: redisConfig.password,
    database: dbNumber
  });

  // Handle connection events
  client.on('connect', () => {
    logger.info(`Redis client connected to DB ${dbNumber}`);
  });

  client.on('ready', () => {
    logger.info(`Redis client ready on DB ${dbNumber}`);
  });

  client.on('error', (err) => {
    logger.error(`Redis client error on DB ${dbNumber}:`, err);
  });

  client.on('end', () => {
    logger.info(`Redis client disconnected from DB ${dbNumber}`);
  });

  return client;
};

// Main Redis client for general caching
const redisClient = createRedisClient(parseInt(process.env.REDIS_DB) || 0);

// Session Redis client (separate DB)
const sessionClient = createRedisClient(parseInt(process.env.REDIS_SESSION_DB) || 1);

// Initialize connections
const initializeRedis = async () => {
  try {
    await redisClient.connect();
    await sessionClient.connect();
    logger.info('Redis clients initialized successfully');
    return true;
  } catch (err) {
    logger.error('Redis initialization failed:', err);
    return false;
  }
};

// Cache helper functions
const cache = {
  // Basic get/set
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Cache get error:', err);
      return null;
    }
  },

  set: async (key, value, ttlSeconds = 3600) => {
    try {
      const serialized = JSON.stringify(value);
      await redisClient.setEx(key, ttlSeconds, serialized);
      return true;
    } catch (err) {
      logger.error('Cache set error:', err);
      return false;
    }
  },

  // Delete key
  del: async (key) => {
    try {
      await redisClient.del(key);
      return true;
    } catch (err) {
      logger.error('Cache delete error:', err);
      return false;
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (err) {
      logger.error('Cache exists error:', err);
      return false;
    }
  },

  // Set with expiry
  expire: async (key, seconds) => {
    try {
      await redisClient.expire(key, seconds);
      return true;
    } catch (err) {
      logger.error('Cache expire error:', err);
      return false;
    }
  }
};

// Session helper functions
const session = {
  get: async (sessionId) => {
    try {
      const value = await sessionClient.get(`session:${sessionId}`);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Session get error:', err);
      return null;
    }
  },

  set: async (sessionId, data, ttlSeconds = 86400) => { // 24 hours default
    try {
      const serialized = JSON.stringify(data);
      await sessionClient.setEx(`session:${sessionId}`, ttlSeconds, serialized);
      return true;
    } catch (err) {
      logger.error('Session set error:', err);
      return false;
    }
  },

  destroy: async (sessionId) => {
    try {
      await sessionClient.del(`session:${sessionId}`);
      return true;
    } catch (err) {
      logger.error('Session destroy error:', err);
      return false;
    }
  }
};

// OTP helper functions
const otp = {
  store: async (phone, otpCode, ttlSeconds = 600) => { // 10 minutes default
    try {
      const key = `otp:${phone}`;
      await redisClient.setEx(key, ttlSeconds, otpCode);
      return true;
    } catch (err) {
      logger.error('OTP store error:', err);
      return false;
    }
  },

  verify: async (phone, otpCode) => {
    try {
      const key = `otp:${phone}`;
      const storedOtp = await redisClient.get(key);
      
      if (storedOtp === otpCode) {
        await redisClient.del(key); // Delete after successful verification
        return true;
      }
      return false;
    } catch (err) {
      logger.error('OTP verify error:', err);
      return false;
    }
  },

  // Rate limiting for OTP requests
  checkRateLimit: async (phone, maxRequests = 3, windowSeconds = 3600) => {
    try {
      const key = `otp_rate:${phone}`;
      const current = await redisClient.get(key);
      
      if (!current) {
        await redisClient.setEx(key, windowSeconds, '1');
        return { allowed: true, remaining: maxRequests - 1 };
      }

      const count = parseInt(current);
      if (count >= maxRequests) {
        const ttl = await redisClient.ttl(key);
        return { allowed: false, remaining: 0, resetIn: ttl };
      }

      await redisClient.incr(key);
      return { allowed: true, remaining: maxRequests - count - 1 };
    } catch (err) {
      logger.error('OTP rate limit error:', err);
      return { allowed: true, remaining: maxRequests - 1 }; // Allow on error
    }
  }
};

// Auction-specific cache helpers
const auction = {
  // Store current auction state
  setState: async (auctionId, state, ttlSeconds = 7200) => { // 2 hours
    const key = `auction:${auctionId}:state`;
    return await cache.set(key, state, ttlSeconds);
  },

  getState: async (auctionId) => {
    const key = `auction:${auctionId}:state`;
    return await cache.get(key);
  },

  // Store bidder list
  addBidder: async (auctionId, userId) => {
    try {
      const key = `auction:${auctionId}:bidders`;
      await redisClient.sAdd(key, userId.toString());
      await redisClient.expire(key, 7200); // 2 hours
      return true;
    } catch (err) {
      logger.error('Add bidder error:', err);
      return false;
    }
  },

  getBidders: async (auctionId) => {
    try {
      const key = `auction:${auctionId}:bidders`;
      const bidders = await redisClient.sMembers(key);
      return bidders.map(id => parseInt(id));
    } catch (err) {
      logger.error('Get bidders error:', err);
      return [];
    }
  }
};

// Graceful shutdown
const closeRedis = async () => {
  try {
    await redisClient.quit();
    await sessionClient.quit();
    logger.info('Redis clients closed');
  } catch (err) {
    logger.error('Error closing Redis clients:', err);
  }
};

// Handle process termination
process.on('SIGINT', closeRedis);
process.on('SIGTERM', closeRedis);

module.exports = {
  redisClient,
  sessionClient,
  initializeRedis,
  cache,
  session,
  otp,
  auction,
  closeRedis
};