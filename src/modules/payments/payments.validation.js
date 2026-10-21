const { z } = require('zod');

const processPaymentSchema = z
  .object({
    consultationId: z.string().uuid({ message: 'Valid consultation UUID is required' }),
    paymentMethod: z
      .enum(['UPI', 'CARD', 'NET_BANKING', 'WALLET', 'FAIL_SIMULATION'], {
        errorMap: () => ({
          message: "Payment method must be 'UPI', 'CARD', 'NET_BANKING', 'WALLET', or 'FAIL_SIMULATION'",
        }),
      })
      .default('UPI'),
    idempotencyKey: z.string().max(100).optional(),
    simulateFailure: z.boolean().optional(),
    cardNumber: z.string().optional(),
    cvv: z.string().optional(),
    pan: z.string().optional(),
    pin: z.string().optional(),
  })
  .refine(
    (data) => !data.cardNumber && !data.cvv && !data.pan && !data.pin,
    {
      message: 'Raw card credentials (PAN, CVV, PIN) must never be transmitted. Card payments must be tokenized.',
    }
  );

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

