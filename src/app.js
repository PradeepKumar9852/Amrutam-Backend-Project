const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const config = require('./config/env');
const swaggerSpec = require('./docs/swagger');
const v1Routes = require('./routes/v1.routes');
const requestCorrelation = require('./middlewares/requestId');
const { getApiRoot, getMetrics } = require('./modules/health/health.controller');
const { metricsMiddleware } = require('./utils/metrics');
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const notFoundHandler = require('./middlewares/notFoundHandler');
const errorHandler = require('./middlewares/errorHandler');

const app = express();

// ==========================================
// 1. Observability & Security Middlewares
// ==========================================

// Request correlation middleware (Attaches X-Request-Id header for distributed tracing)
app.use(requestCorrelation);

// Prometheus metrics recording middleware
app.use(metricsMiddleware);


// Helmet sets secure HTTP response headers
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configures allowed origins (compliant with credentials: true)
const allowedOrigins = config.corsOrigin === '*'
  ? true
  : config.corsOrigin.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins === true) return callback(null, origin);
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      return callback(new Error('CORS policy does not allow access from the specified Origin.'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'x-idempotency-key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-Idempotent-Replay'],
    credentials: true,
  })
);

// Body parsing middlewares - Restricted to 1mb to mitigate Denial of Service (DoS) memory exhaustion
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Custom Morgan token for request ID
morgan.token('req-id', (req) => req.id || '-');

// HTTP request logging with correlation ID
if (config.isDevelopment) {
  app.use(morgan(':req-id :method :url :status :response-time ms'));
} else {
  app.use(morgan(':req-id :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'));
}

// ==========================================
// 2. Swagger / OpenAPI Documentation
// ==========================================

// Swagger UI Route (Scoped relaxed CSP for Swagger UI assets)
app.use(
  '/api-docs',
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Amrutam Telemedicine API Docs',
  })
);

// Raw OpenAPI JSON specification
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// ==========================================
// 3. Application Routes
// ==========================================

// Root welcome route delegated to controller
app.get('/', getApiRoot);

// Prometheus scrape endpoint
app.get('/metrics', getMetrics);

// API v1 route mount (Protected by apiRateLimiter against excessive traffic & scraping)
app.use('/api/v1', apiRateLimiter, v1Routes);


// ==========================================
// 4. Error Handling Middlewares
// ==========================================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized global error handler
app.use(errorHandler);

module.exports = app;
