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

const createUserSchema = z.object({
  email: z.string().email('Invalid email address format').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).default('PATIENT'),
  isActive: z.boolean().optional().default(true),
});

const userQuerySchema = z.object({
  role: z.enum(['ADMIN', 'DOCTOR', 'PATIENT']).optional(),
  isActive: z.string().optional(),
  search: z.string().optional(),
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

const analyticsQuerySchema = z.object({
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
});

module.exports = {
  verifyDoctorSchema,
  userStatusSchema,
  auditLogQuerySchema,
  createUserSchema,
  userQuerySchema,
  analyticsQuerySchema,
};
