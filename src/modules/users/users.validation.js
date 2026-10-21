const { z } = require('zod');

const updateProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100).optional(),
  lastName: z.string().min(1, 'Last name is required').max(100).optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().max(10).optional(),
  emergencyContact: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
});

module.exports = {
  updateProfileSchema,
};
