const {
  createBookingSchema,
  cancelBookingSchema,
  updateStatusSchema,
  bookingQuerySchema,
} = require('../bookings/bookings.validation');

module.exports = {
  createConsultationSchema: createBookingSchema,
  cancelConsultationSchema: cancelBookingSchema,
  updateStatusSchema,
  consultationQuerySchema: bookingQuerySchema,
};
