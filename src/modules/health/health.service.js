const os = require('os');
const config = require('../../config/env');
const { checkDatabaseHealth } = require('../../config/prisma');
const { isRedisConnected } = require('../../config/redis');

/**
 * Service to aggregate system health, memory, database, and Redis cache status
 */
async function getSystemHealth() {
  const dbHealth = await checkDatabaseHealth();
  const uptimeSeconds = Math.floor(process.uptime());
  const redisConnected = isRedisConnected();

  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.env,
    uptime: {
      seconds: uptimeSeconds,
      formatted: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m ${uptimeSeconds % 60}s`,
    },
    system: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: {
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
      },
    },
    database: {
      provider: 'postgresql',
      connected: dbHealth.isConnected,
      latencyMs: dbHealth.latencyMs || null,
      message: dbHealth.isConnected
        ? 'Database connection is healthy'
        : dbHealth.error || 'Database connection pending or unreachable',
    },
    cache: {
      provider: 'redis',
      connected: redisConnected,
      mode: redisConnected ? 'redis_active' : 'fallback_in_memory',
    },
  };
}

module.exports = {
  getSystemHealth,
};
