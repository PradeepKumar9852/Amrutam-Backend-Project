const { z } = require('zod');

const auditQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).default('1').transform((val) => parseInt(val, 10)),
  limit: z.string().regex(/^\d+$/).default('20').transform((val) => Math.min(parseInt(val, 10), 100)),
  action: z.enum([
    'USER_REGISTERED',
    'USER_LOGIN',
    'SLOT_CREATED',
    'SLOT_DELETED',
    'BOOKING_CREATED',
    'BOOKING_CONFIRMED',
    'BOOKING_CANCELLED',
    'CONSULTATION_COMPLETED',
    'PRESCRIPTION_ISSUED',
    'PAYMENT_PROCESSED',
    'PAYMENT_REFUNDED',
  ]).optional(),
  entityType: z.string().optional(),
  userId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

module.exports = {
  auditQuerySchema,
};
