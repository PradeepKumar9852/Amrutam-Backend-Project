const request = require('supertest');
const app = require('../src/app');
const CircuitBreaker = require('../src/utils/circuitBreaker');
const { retryWithBackoff } = require('../src/jobs/retry');

describe('Reliability, Observability & Resilience Test Suite', () => {

  describe('1. Circuit Breaker Behavior', () => {
    let breaker;

    beforeEach(() => {
      breaker = new CircuitBreaker('test-external-service', {
        failureThreshold: 3,
        cooldownDurationMs: 150, // Short cooldown for testing
        timeoutMs: 500,
      });
    });

    it('should start in CLOSED state and execute successful calls', async () => {
      const mockService = jest.fn().mockResolvedValue({ status: 'ok' });
      const result = await breaker.execute(mockService);

      expect(result).toEqual({ status: 'ok' });
      expect(breaker.state).toBe('CLOSED');
      expect(breaker.consecutiveFailures).toBe(0);
      expect(mockService).toHaveBeenCalledTimes(1);
    });

    it('should record failures and trip to OPEN after threshold is reached', async () => {
      const failingService = jest.fn().mockRejectedValue(new Error('Downstream network fault'));

      // Attempts 1 and 2 should fail but keep circuit CLOSED
      await expect(breaker.execute(failingService)).rejects.toThrow('Downstream network fault');
      expect(breaker.state).toBe('CLOSED');
      expect(breaker.consecutiveFailures).toBe(1);

      await expect(breaker.execute(failingService)).rejects.toThrow('Downstream network fault');
      expect(breaker.state).toBe('CLOSED');
      expect(breaker.consecutiveFailures).toBe(2);

      // Attempt 3 hits threshold (3) -> trips to OPEN
      await expect(breaker.execute(failingService)).rejects.toThrow('Downstream network fault');
      expect(breaker.state).toBe('OPEN');
      expect(breaker.consecutiveFailures).toBe(3);

      // Subsequent attempt while OPEN should fast-reject without invoking downstream
      failingService.mockClear();
      await expect(breaker.execute(failingService)).rejects.toThrow(/temporarily unavailable/i);
      expect(failingService).not.toHaveBeenCalled();
    });

    it('should invoke fallback function when circuit is OPEN', async () => {
      // Force trip to OPEN
      const failingService = jest.fn().mockRejectedValue(new Error('Gateway timeout'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingService)).rejects.toThrow();
      }
      expect(breaker.state).toBe('OPEN');

      // Call with fallback
      const fallback = jest.fn().mockResolvedValue({ fallback: true, cached: true });
      const result = await breaker.execute(failingService, fallback);

      expect(fallback).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ fallback: true, cached: true });
    });

    it('should transition to HALF_OPEN after cooldown and reset to CLOSED on success', async () => {
      const failingService = jest.fn().mockRejectedValue(new Error('Database lock error'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failingService)).rejects.toThrow();
      }
      expect(breaker.state).toBe('OPEN');

      // Wait for cooldown duration (150ms + 50ms buffer)
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Healthy service during trial
      const healthyService = jest.fn().mockResolvedValue({ status: 'recovered' });
      const result = await breaker.execute(healthyService);

      expect(result).toEqual({ status: 'recovered' });
      expect(breaker.state).toBe('CLOSED');
      expect(breaker.consecutiveFailures).toBe(0);
    });

    it('should time out requests that exceed timeoutMs', async () => {
      const slowService = jest.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 800)));
      await expect(breaker.execute(slowService)).rejects.toThrow(/failed to respond within/);
    });
  });

  describe('2. Retry with Exponential Backoff & Jitter', () => {
    it('should succeed on first attempt if no error occurs', async () => {
      const task = jest.fn().mockResolvedValue('immediate_success');
      const result = await retryWithBackoff(task, { maxRetries: 3, initialDelayMs: 20 });
      expect(result).toBe('immediate_success');
      expect(task).toHaveBeenCalledTimes(1);
    });

    it('should retry transient errors and return success when subsequent attempt succeeds', async () => {
      let attempts = 0;
      const task = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary gateway disconnect');
        }
        return 'recovered_after_retries';
      });

      const result = await retryWithBackoff(task, {
        maxRetries: 4,
        initialDelayMs: 20,
        backoffFactor: 1.5,
        jitter: false,
        taskName: 'TransientGatewayCall',
      });

      expect(result).toBe('recovered_after_retries');
      expect(task).toHaveBeenCalledTimes(3);
    });

    it('should exhaust retries and throw error when maxRetries is exceeded', async () => {
      const persistentError = new Error('Permanent downstream failure');
      const task = jest.fn().mockRejectedValue(persistentError);

      await expect(
        retryWithBackoff(task, {
          maxRetries: 2,
          initialDelayMs: 15,
          jitter: false,
          taskName: 'FailingService',
        })
      ).rejects.toThrow('Permanent downstream failure');

      expect(task).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });
  });

  describe('3. Kubernetes Health Probes & Metrics', () => {
    it('GET /api/v1/health/liveness should return 200 with status UP', async () => {
      const res = await request(app).get('/api/v1/health/liveness');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(typeof res.body.data.uptimeSeconds).toBe('number');
      expect(res.body.data.timestamp).toBeDefined();
    });

    it('GET /api/v1/health/readiness should return 200 with status READY when database is healthy', async () => {
      const res = await request(app).get('/api/v1/health/readiness');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('READY');
      expect(res.body.data.database).toBe('connected');
      expect(typeof res.body.data.latencyMs).toBe('number');
    });

    it('GET /api/v1/health should return detailed system diagnostic info', async () => {
      const res = await request(app).get('/api/v1/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.database.connected).toBe(true);
      expect(res.body.data.system.nodeVersion).toBeDefined();
    });

    it('GET /metrics should return standard Prometheus metrics text format', async () => {
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('http_request_duration_seconds');
      expect(res.text).toContain('nodejs_uptime_seconds');
    });
  });

  describe('4. Tracing, Correlation & OpenTelemetry Headers', () => {
    it('should generate X-Request-Id and W3C traceparent headers on every response', async () => {
      const res = await request(app).get('/api/v1/health/liveness');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['traceparent']).toBeDefined();

      // W3C traceparent pattern: 00-{32 hex trace_id}-{16 hex span_id}-{2 hex flags}
      const traceparentRegex = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;
      expect(res.headers['traceparent']).toMatch(traceparentRegex);
    });

    it('should preserve and echo client-provided X-Request-Id', async () => {
      const customRequestId = 'test-client-correlation-998877';
      const res = await request(app)
        .get('/api/v1/health/liveness')
        .set('X-Request-Id', customRequestId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(customRequestId);
    });

    it('should preserve incoming W3C trace_id and generate a new span_id', async () => {
      const incomingTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
      const incomingSpanId = '00f067aa0ba902b7';
      const incomingTraceparent = `00-${incomingTraceId}-${incomingSpanId}-01`;

      const res = await request(app)
        .get('/api/v1/health/liveness')
        .set('traceparent', incomingTraceparent);

      expect(res.status).toBe(200);
      const outgoingTraceparent = res.headers['traceparent'];
      expect(outgoingTraceparent).toBeDefined();

      const parts = outgoingTraceparent.split('-');
      expect(parts[0]).toBe('00');
      expect(parts[1]).toBe(incomingTraceId); // Trace ID must be preserved across distributed hops
      expect(parts[2]).not.toBe(incomingSpanId); // New downstream span ID generated
      expect(parts[3]).toBe('01');
    });
  });
});
