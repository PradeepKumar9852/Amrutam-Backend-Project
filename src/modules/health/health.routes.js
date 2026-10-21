const express = require('express');
const { checkHealth, getMetrics, getLiveness, getReadiness } = require('./health.controller');

const router = express.Router();

/**
 * @route   GET /api/v1/health
 * @desc    Get API system health and PostgreSQL connection status
 * @access  Public
 */
router.get('/', checkHealth);

/**
 * @route   GET /api/v1/health/liveness
 * @desc    Kubernetes / Container orchestrator liveness probe
 * @access  Public
 */
router.get('/liveness', getLiveness);

/**
 * @route   GET /api/v1/health/readiness
 * @desc    Kubernetes / Load balancer readiness probe
 * @access  Public
 */
router.get('/readiness', getReadiness);

/**
 * @route   GET /api/v1/health/metrics
 * @desc    Prometheus plain-text scraping endpoint
 * @access  Public
 */
router.get('/metrics', getMetrics);

module.exports = router;

