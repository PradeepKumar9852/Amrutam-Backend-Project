# Amrutam Telemedicine Backend - Observability & Monitoring

This document describes the observability infrastructure, structured logging format, request correlation, health reporting, and telemetry integration for the Amrutam Telemedicine Backend.

---

## 1. Request Correlation & Distributed Tracing

Every incoming HTTP request is assigned a unique correlation identifier to allow tracing across services, reverse proxies, and database queries.

### Implementation
- **Middleware**: [`src/middlewares/requestId.js`](../src/middlewares/requestId.js)
- **Header**: `X-Request-Id` (propagated from incoming headers or generated as a UUIDv4).
- **Response**: The backend always echoes the correlation ID in the response headers:
  ```http
  HTTP/1.1 200 OK
  X-Request-Id: 5d71fc07-892f-4679-93fe-6c916ea0003b
  Content-Type: application/json
  ```
- **Error Response Correlation**:
  When an API error occurs, `requestId` is included in the JSON body:
  ```json
  {
    "success": false,
    "statusCode": 404,
    "message": "Booking not found",
    "requestId": "5d71fc07-892f-4679-93fe-6c916ea0003b"
  }
  ```

---

## 2. Structured JSON Logging

In [`src/utils/logger.js`](../src/utils/logger.js), logs are formatted based on the runtime environment:
- **Development**: Clean, colorized, human-readable terminal output.
- **Production (`NODE_ENV=production`)**: Single-line structured JSON records optimized for automated ingestion by log aggregators (e.g. AWS CloudWatch, Datadog, ELK Stack, Grafana Loki).

### Production JSON Log Example
```json
{
  "timestamp": "2026-10-20T16:07:17.953Z",
  "level": "ERROR",
  "message": "[GET] /api/v1/auth/me - Authentication token has expired. Please log in again.",
  "meta": {
    "requestId": "5d71fc07-892f-4679-93fe-6c916ea0003b",
    "statusCode": 401
  }
}
```

### Sensitive Data Redaction Guarantee
The logger contains an automated recursive sanitizer (`sanitizeMeta`) that strips or replaces sensitive keys with `[REDACTED]`. The following keys are never logged in plaintext:
- `password`, `passwordHash`
- `token`, `secret`, `jwtSecret`, `authorization`
- `symptomsSummary`, `diagnosisSummary`, `emergencyContact`

---

## 3. Health & Liveness Checks

The system provides a non-crashing, deep health-check endpoint for orchestrators (Kubernetes, Docker Compose, AWS ALB):

### Endpoint: `GET /api/v1/health`
- **Access**: Public
- **Checks Performed**:
  1. Process uptime and Node.js runtime statistics.
  2. RSS, heap used, and heap total memory metrics.
  3. Live PostgreSQL connection latency (`SELECT 1`).
  4. Live Redis connection and operational mode (`redis_active` vs `fallback_in_memory`).

### Sample Health Check Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "System health check retrieved successfully",
  "data": {
    "status": "ok",
    "timestamp": "2026-10-20T16:10:00.000Z",
    "environment": "production",
    "uptime": {
      "seconds": 3600,
      "formatted": "1h 0m 0s"
    },
    "system": {
      "nodeVersion": "v22.20.0",
      "platform": "linux",
      "memoryUsage": {
        "rss": "65 MB",
        "heapUsed": "32 MB",
        "heapTotal": "48 MB"
      }
    },
    "database": {
      "provider": "postgresql",
      "connected": true,
      "latencyMs": 4,
      "message": "Database connection is healthy"
    },
    "cache": {
      "provider": "redis",
      "connected": true,
      "mode": "redis_active"
    }
  }
}
```

---

## 4. Production Metrics & Tracing Integration Guidelines

For enterprise production deployments, the following observability tools can be attached without altering application business logic:

1. **Prometheus Metrics (`prom-client`)**:
   - Collect HTTP request duration histograms (`http_request_duration_seconds`).
   - Track active WebSocket connections and consultation room counts.
   - Monitor database query latency and Prisma connection pool exhaustion.
2. **OpenTelemetry Distributed Tracing**:
   - Instrument Express and PostgreSQL via the `@opentelemetry/sdk-node` auto-instrumentation package.
   - Propagate W3C `traceparent` headers alongside `X-Request-Id` to trace calls across API gateways, backend services, and third-party payment/video providers.
3. **Alerting Thresholds**:
   - High Error Rate: Alert if 5xx errors exceed 1% over a 5-minute sliding window.
   - Database Latency: Alert if `database.latencyMs` exceeds 500ms on consecutive health checks.
   - Memory Saturation: Alert if process memory usage exceeds 80% of container limits.
