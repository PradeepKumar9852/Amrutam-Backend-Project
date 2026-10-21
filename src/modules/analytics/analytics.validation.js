const { z } = require('zod');

const analyticsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

module.exports = {
  analyticsQuerySchema,
};
