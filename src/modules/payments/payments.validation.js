const { z } = require('zod');

const processPaymentSchema = z.object({
  consultationId: z.string().uuid({ message: 'Valid consultation UUID is required' }),
  paymentMethod: z
    .enum(['UPI', 'CARD', 'NET_BANKING', 'WALLET'], {
      errorMap: () => ({ message: "Payment method must be 'UPI', 'CARD', 'NET_BANKING', or 'WALLET'" }),
    })
    .default('UPI'),
  idempotencyKey: z.string().max(100).optional(),
});

const refundPaymentSchema = z.object({
  reason: z
    .string({ required_error: 'Refund reason is required' })
    .min(5, 'Refund reason must be at least 5 characters')
    .max(500, 'Refund reason cannot exceed 500 characters'),
});

module.exports = {
  processPaymentSchema,
  refundPaymentSchema,
};
