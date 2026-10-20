/**
 * Prometheus-compatible Metrics Collector
 * Lightweight, zero-external-dependency metrics exporter.
 * Tracks HTTP request counts, response latency histograms (p50, p90, p95, p99),
 * system memory, and database status.
 */

const os = require('os');

// In-memory metrics storage
const metrics = {
  httpRequestsTotal: new Map(), // key: `${method}|${route}|${status}` -> count
  httpDurationBuckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0], // seconds
  httpDurationHistograms: new Map(), // key: `${method}|${route}` -> { count, sum, buckets: Map(le -> count) }
  activeConnections: 0,
  startTime: Date.now(),
};

/**
 * Express middleware to record HTTP metrics
 */
function metricsMiddleware(req, res, next) {
  const startHrTime = process.hrtime();
  metrics.activeConnections++;

  res.on('finish', () => {
    metrics.activeConnections--;
    const [seconds, nanoseconds] = process.hrtime(startHrTime);
    const durationSeconds = seconds + nanoseconds / 1e9;

    // Normalize path to prevent high cardinality (e.g. /api/v1/bookings/uuid -> /api/v1/bookings/:id)
    const normalizedRoute = normalizeRoute(req.baseUrl + (req.route ? req.route.path : req.path));
    const method = req.method;
    const status = res.statusCode;

    // Increment request counter
    const counterKey = `${method}|${normalizedRoute}|${status}`;
    const currentCount = metrics.httpRequestsTotal.get(counterKey) || 0;
    metrics.httpRequestsTotal.set(counterKey, currentCount + 1);

    // Record latency in histogram
    const histKey = `${method}|${normalizedRoute}`;
    if (!metrics.httpDurationHistograms.has(histKey)) {
      const bucketMap = new Map();
      metrics.httpDurationBuckets.forEach((b) => bucketMap.set(b, 0));
      metrics.httpDurationHistograms.set(histKey, { count: 0, sum: 0, buckets: bucketMap });
    }

    const hist = metrics.httpDurationHistograms.get(histKey);
    hist.count += 1;
    hist.sum += durationSeconds;

    metrics.httpDurationBuckets.forEach((b) => {
      if (durationSeconds <= b) {
        hist.buckets.set(b, hist.buckets.get(b) + 1);
      }
    });
  });

  next();
}

/**
 * Replace UUIDs and numeric IDs with placeholders to prevent metric cardinality explosion
 */
function normalizeRoute(path) {
  if (!path) return 'unknown';
  return path
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

/**
 * Generate standard Prometheus exposition format (text/plain)
 */
function getPrometheusMetrics() {
  const lines = [];

  lines.push('# HELP nodejs_uptime_seconds Number of seconds the Node.js process has been running');
  lines.push('# TYPE nodejs_uptime_seconds gauge');
  lines.push(`nodejs_uptime_seconds ${Math.floor(process.uptime())}`);

  const mem = process.memoryUsage();
  lines.push('# HELP nodejs_memory_heap_used_bytes Process heap memory used in bytes');
  lines.push('# TYPE nodejs_memory_heap_used_bytes gauge');
  lines.push(`nodejs_memory_heap_used_bytes ${mem.heapUsed}`);

  lines.push('# HELP nodejs_memory_heap_total_bytes Process heap memory total in bytes');
  lines.push('# TYPE nodejs_memory_heap_total_bytes gauge');
  lines.push(`nodejs_memory_heap_total_bytes ${mem.heapTotal}`);

  lines.push('# HELP nodejs_memory_rss_bytes Process resident set size in bytes');
  lines.push('# TYPE nodejs_memory_rss_bytes gauge');
  lines.push(`nodejs_memory_rss_bytes ${mem.rss}`);

  lines.push('# HELP http_active_connections Current active HTTP connections');
  lines.push('# TYPE http_active_connections gauge');
  lines.push(`http_active_connections ${Math.max(0, metrics.activeConnections)}`);

  lines.push('# HELP http_requests_total Total number of HTTP requests processed');
  lines.push('# TYPE http_requests_total counter');
  for (const [key, count] of metrics.httpRequestsTotal.entries()) {
    const [method, route, status] = key.split('|');
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`);
  }

  lines.push('# HELP http_request_duration_seconds HTTP request duration histogram in seconds');
  lines.push('# TYPE http_request_duration_seconds histogram');
  for (const [key, hist] of metrics.httpDurationHistograms.entries()) {
    const [method, route] = key.split('|');
    for (const [le, bCount] of hist.buckets.entries()) {
      lines.push(`http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${le}"} ${bCount}`);
    }
    lines.push(`http_request_duration_seconds_bucket{method="${method}",route="${route}",le="+Inf"} ${hist.count}`);
    lines.push(`http_request_duration_seconds_sum{method="${method}",route="${route}"} ${hist.sum.toFixed(4)}`);
    lines.push(`http_request_duration_seconds_count{method="${method}",route="${route}"} ${hist.count}`);
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  metricsMiddleware,
  getPrometheusMetrics,
};
