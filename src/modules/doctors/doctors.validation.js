const { z } = require('zod');

const createSlotSchema = z
  .object({
    startTime: z.string().datetime({ offset: true, message: 'Invalid start time ISO format' }),
    endTime: z.string().datetime({ offset: true, message: 'Invalid end time ISO format' }),
  })
  .refine(
    (data) => new Date(data.endTime) > new Date(data.startTime),
    {
      message: 'Slot end time must be after start time',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => new Date(data.startTime) > new Date(),
    {
      message: 'Slot start time must be in the future',
      path: ['startTime'],
    }
  );

const createMultipleSlotsSchema = z.object({
  slots: z.array(createSlotSchema).min(1, 'At least one slot must be provided'),
});

const doctorQuerySchema = z.object({
  specialization: z.string().optional(),
  search: z.string().optional(),
  isVerified: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  minExperience: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => isNaN(val) || val >= 0, 'Experience must be non-negative')
    .optional(),
  minFee: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => isNaN(val) || val >= 0, 'Minimum fee must be non-negative')
    .optional(),
  maxFee: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => isNaN(val) || val >= 0, 'Maximum fee must be non-negative')
    .optional(),
  sortBy: z
    .enum(['experienceYears', 'consultationFee', 'createdAt', 'firstName'])
    .optional()
    .default('experienceYears'),
  sortOrder: z
    .enum(['asc', 'desc'])
    .optional()
    .default('desc'),
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

const slotQuerySchema = z.object({
  startDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  isBooked: z
    .string()
    .transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined))
    .optional(),
});

module.exports = {
  createSlotSchema,
  createMultipleSlotsSchema,
  doctorQuerySchema,
  slotQuerySchema,
};
