const { z } = require('zod');

const verifyDoctorSchema = z.object({
  isVerified: z.boolean({ required_error: 'isVerified boolean flag is required' }),
});

const userStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive boolean flag is required' }),
});

const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  entityType: z.string().optional(),
  userId: z.string().uuid('Invalid user UUID format').optional(),
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  page: z
    .string()
    .transform((val) => Math.max(1, parseInt(val, 10) || 1))
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((val) => Math.min(100, Math.max(1, parseInt(val, 10) || 20)))
    .optional()
    .default('20'),
});

module.exports = {
  verifyDoctorSchema,
  userStatusSchema,
  auditLogQuerySchema,
};
