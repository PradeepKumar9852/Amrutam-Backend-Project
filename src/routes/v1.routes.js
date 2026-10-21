const express = require('express');
const healthRoutes = require('../modules/health/health.routes');
const authRoutes = require('../modules/auth/auth.routes');
const usersRoutes = require('../modules/users/users.routes');
const doctorsRoutes = require('../modules/doctors/doctors.routes');
const availabilityRoutes = require('../modules/availability/availability.routes');
const consultationsRoutes = require('../modules/consultations/consultations.routes');
const bookingsRoutes = require('../modules/bookings/bookings.routes');
const prescriptionsRoutes = require('../modules/prescriptions/prescriptions.routes');
const paymentsRoutes = require('../modules/payments/payments.routes');
const auditRoutes = require('../modules/audit/audit.routes');
const analyticsRoutes = require('../modules/analytics/analytics.routes');
const adminRoutes = require('../modules/admin/admin.routes');

const router = express.Router();

/**
 * Main API v1 Router
 * Mounts domain modules
 */
router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/doctors', doctorsRoutes);
router.use('/availability', availabilityRoutes);
router.use('/consultations', consultationsRoutes);
router.use('/bookings', bookingsRoutes);
router.use('/prescriptions', prescriptionsRoutes);
router.use('/payments', paymentsRoutes);
router.use('/audit', auditRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/admin', adminRoutes);

module.exports = router;


