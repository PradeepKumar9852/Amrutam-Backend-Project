const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const config = require('./env');

const prisma = new PrismaClient({
  log: config.isDevelopment
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ]
    : ['error'],
});

if (config.isDevelopment) {
  prisma.$on('query', (e) => {
    logger.debug(`Prisma Query: ${e.query} - Duration: ${e.duration}ms`);
  });
}

/**
 * Helper to check PostgreSQL database connectivity.
 * @returns {Promise<{ isConnected: boolean, latencyMs?: number, error?: string }>}
 */
async function checkDatabaseHealth() {
  const startTime = Date.now();
  try {
    // Run simple lightweight query
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - startTime;
    return { isConnected: true, latencyMs };
  } catch (error) {
    return {
      isConnected: false,
      error: error.message || 'Unable to connect to PostgreSQL database',
    };
  }
}

module.exports = {
  prisma,
  checkDatabaseHealth,
};
