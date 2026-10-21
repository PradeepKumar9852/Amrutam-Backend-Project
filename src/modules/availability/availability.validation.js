const { z } = require('zod');

const createSlotSchema = z.object({
  startTime: z.string().datetime({ message: 'startTime must be a valid ISO 8601 UTC date string' }),
  endTime: z.string().datetime({ message: 'endTime must be a valid ISO 8601 UTC date string' }),
}).refine((data) => new Date(data.endTime) > new Date(data.startTime), {
  message: 'endTime must be after startTime',
  path: ['endTime'],
});

const createMultipleSlotsSchema = z.object({
  slots: z.array(createSlotSchema).min(1, 'At least one slot must be provided'),
});

const slotQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  includeBooked: z.enum(['true', 'false']).default('false').transform((val) => val === 'true'),
});

module.exports = {
  createSlotSchema,
  createMultipleSlotsSchema,
  slotQuerySchema,
};
