const express = require('express');
const { checkHealth, getMetrics } = require('./health.controller');

const router = express.Router();

/**
 * @route   GET /api/v1/health
 * @desc    Get API system health and PostgreSQL connection status
 * @access  Public
 */
router.get('/', checkHealth);

/**
 * @route   GET /api/v1/health/metrics
 * @desc    Prometheus plain-text scraping endpoint
 * @access  Public
 */
router.get('/metrics', getMetrics);

module.exports = router;

