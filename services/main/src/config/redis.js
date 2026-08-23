const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});

redis.on('connect', () => logger.info('Redis connected (main-service)'));
// This is NOT "just a cache" — it backs BullMQ (scan/fix queues) and the
// rate limiter — but ioredis's own retryStrategy above already handles
// reconnecting after a transient blip, so a mid-session error here logs
// and lets ioredis retry rather than crashing the process. The one-time
// startup check in server.js is what actually fails fast if Redis is
// unreachable when the service boots.
redis.on('error', (err) => logger.error({ err }, 'Redis error — ioredis will retry automatically'));

module.exports = redis;
