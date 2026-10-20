const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: process.env.DATABASE_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  jwtSecret: process.env.JWT_SECRET || 'amrutam_secret_fallback',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  isDevelopment: (process.env.NODE_ENV || 'development') === 'development',
  isProduction: process.env.NODE_ENV === 'production',
};

// Security assertion: Prevent running with default secret in production
if (config.isProduction) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'amrutam_secret_fallback' || process.env.JWT_SECRET.length < 32) {
    throw new Error(
      'SECURITY CRITICAL: JWT_SECRET must be explicitly set with at least 32 characters in production environments.'
    );
  }
}

module.exports = config;
