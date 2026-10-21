const bookingsService = require('../bookings/bookings.service');

/**
 * Service to manage consultations lifecycle
 */
async function bookConsultation(userId, payload, idempotencyKey = null, clientInfo = {}) {
  return bookingsService.createBooking(userId, payload, idempotencyKey, clientInfo);
}

async function listConsultations(user, query = {}) {
  return bookingsService.listUserBookings(user, query);
}

async function getConsultationById(user, consultationId) {
  return bookingsService.getBookingById(user, consultationId);
}

async function updateConsultationStatus(user, consultationId, status, notes = '') {
  return bookingsService.updateBookingStatus(user, consultationId, status, notes);
}

async function cancelConsultation(user, consultationId, cancellationReason, clientInfo = {}) {
  return bookingsService.cancelBooking(user, consultationId, cancellationReason, clientInfo);
}

module.exports = {
  bookConsultation,
  listConsultations,
  getConsultationById,
  updateConsultationStatus,
  cancelConsultation,
};
