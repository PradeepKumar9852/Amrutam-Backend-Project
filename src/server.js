const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { prisma, checkDatabaseHealth } = require('./config/prisma');

let server;

/**
 * Start the HTTP server and perform startup checks
 */
async function startServer() {
  try {
    // 1. Perform database connection check
    logger.info('Initializing Amrutam Telemedicine Backend...');
    logger.info(`Environment: ${config.env}`);

    const dbHealth = await checkDatabaseHealth();
    if (dbHealth.isConnected) {
      logger.info(`PostgreSQL database connected successfully (Latency: ${dbHealth.latencyMs}ms)`);
    } else {
      logger.warn(`PostgreSQL not connected yet: ${dbHealth.error}`);
      logger.warn('Server will continue running. Ensure PostgreSQL is started and DATABASE_URL is set in .env');
    }

    // 2. Start HTTP server
    server = app.listen(config.port, () => {
      logger.info(`====================================================`);
      logger.info(` Amrutam Telemedicine API is running!`);
      logger.info(` Server URL: http://localhost:${config.port}`);
      logger.info(` Health Check: http://localhost:${config.port}/api/v1/health`);
      logger.info(`====================================================`);
    });
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await prisma.$disconnect();
        logger.info('Prisma client disconnected.');
      } catch (err) {
        logger.error('Error disconnecting Prisma:', { error: err.message });
      }
      try {
        const { closeRedis } = require('./config/redis');
        await closeRedis();
        logger.info('Redis client disconnected.');
      } catch (err) {
        logger.error('Error disconnecting Redis:', { error: err.message });
      }
      process.exit(0);
    });

    // Force close after 10s if connections refuse to terminate
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
}

// Process signals & unhandled events
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Run server
startServer();
