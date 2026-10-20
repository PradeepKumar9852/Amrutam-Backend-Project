const ApiResponse = require('../../utils/apiResponse');
const { getSystemHealth } = require('./health.service');
const { getPrometheusMetrics } = require('../../utils/metrics');

/**
 * Controller for GET / (Root Welcome Endpoint)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function getApiRoot(req, res) {
  return ApiResponse.success(res, 200, 'Welcome to Amrutam Telemedicine Backend API', {
    version: '1.0.0',
    endpoints: {
      documentation: '/api-docs',
      openApiJson: '/api-docs.json',
      healthCheck: '/api/v1/health',
      metrics: '/metrics',
    },
  });
}

/**
 * Controller for GET /api/v1/health (System Health & DB Connectivity)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function checkHealth(req, res, next) {
  try {
    const healthData = await getSystemHealth();
    return ApiResponse.success(res, 200, 'Amrutam Telemedicine Backend API is operational', healthData);
  } catch (error) {
    next(error);
  }
}

/**
 * Controller for GET /metrics and GET /api/v1/health/metrics (Prometheus scrape endpoint)
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function getMetrics(req, res) {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  return res.send(getPrometheusMetrics());
}

module.exports = {
  getApiRoot,
  checkHealth,
  getMetrics,
};

