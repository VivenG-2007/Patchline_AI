const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

// Backs the rate limiter only (auth-service has no queues) — but that's
// still a piece of shared state that must not live in-process, or rate
// limits reset per-instance the moment this service scales past one
// replica. Same client pattern as main-service/src/config/redis.js so both
// Node services behave identically under a Redis blip.
const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 1000, 10000),
});

redis.on('connect', () => logger.info('Redis connected (auth-service)'));
redis.on('error', (err) => logger.warn({ err: err.message }, 'Redis offline — continuing without cache'));

module.exports = redis;
