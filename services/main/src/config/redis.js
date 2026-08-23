const Redis = require('ioredis');
const env = require('./env');
const logger = require('./logger');

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => Math.min(times * 1000, 10000),
});

redis.on('connect', () => logger.info('Redis connected (main-service)'));
redis.on('error', (err) => logger.warn({ err: err.message }, 'Redis offline — continuing without cache'));

module.exports = redis;
