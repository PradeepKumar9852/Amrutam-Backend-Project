const dotenv = require('dotenv');
const path = require('path');
const { z } = require('zod');

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10))
    .refine((port) => port > 0 && port < 65536, {
      message: 'PORT must be a valid port number between 1 and 65535',
    }),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required for database connectivity').optional(),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().default('amrutam_secret_fallback_key_32_characters_minimum'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const formattedErrors = Object.entries(parsed.error.flatten().fieldErrors)
    .map(([key, msgs]) => `  - ${key}: ${msgs.join(', ')}`)
    .join('\n');
  console.error(`\n❌ Environment Variable Configuration Error:\n${formattedErrors}\n`);
  throw new Error('Environment variable validation failed');
}

const envData = parsed.data;

const config = {
  env: envData.NODE_ENV,
  port: envData.PORT,
  databaseUrl: envData.DATABASE_URL || process.env.DATABASE_URL || '',
  corsOrigin: envData.CORS_ORIGIN,
  jwtSecret: envData.JWT_SECRET,
  jwtExpiresIn: envData.JWT_EXPIRES_IN,
  redisUrl: envData.REDIS_URL,
  isDevelopment: envData.NODE_ENV === 'development',
  isProduction: envData.NODE_ENV === 'production',
  isTest: envData.NODE_ENV === 'test',
};

// Security assertion: Prevent running with default secret in production
if (config.isProduction) {
  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET === 'amrutam_secret_fallback_key_32_characters_minimum' ||
    process.env.JWT_SECRET.length < 32
  ) {
    throw new Error(
      'SECURITY CRITICAL: JWT_SECRET must be explicitly set with at least 32 characters in production environments.'
    );
  }
}

module.exports = config;
