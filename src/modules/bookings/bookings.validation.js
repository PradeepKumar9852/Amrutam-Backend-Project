const { z } = require('zod');

const createBookingSchema = z.object({
  slotId: z.string().uuid('Invalid slot UUID format'),
  consultationType: z.enum(['VIDEO', 'AUDIO', 'CHAT']).optional().default('VIDEO'),
  symptomsSummary: z.string().max(1000, 'Symptoms summary too long').optional(),
  idempotencyKey: z.string().max(100).optional(),
});

const cancelBookingSchema = z.object({
  cancellationReason: z
    .string()
    .min(3, 'Cancellation reason is required (minimum 3 characters)')
    .max(500, 'Cancellation reason is too long'),
});

const updateStatusSchema = z.object({
  status: z.enum(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']),
  notes: z.string().max(500).optional(),
});

const bookingQuerySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RESCHEDULED']).optional(),
  page: z
    .string()
    .transform((val) => Math.max(1, parseInt(val, 10) || 1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => Math.min(50, Math.max(1, parseInt(val, 10) || 10)))
    .optional()
    .default('10'),
});

module.exports = {
  createBookingSchema,
  cancelBookingSchema,
  updateStatusSchema,
  bookingQuerySchema,
};
