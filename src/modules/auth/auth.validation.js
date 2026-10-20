const { z } = require('zod');

const registerPatientSchema = z.object({
  email: z.string().email('Invalid email address format').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  firstName: z.string().min(2, 'First name must have at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must have at least 2 characters').trim(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().max(10).optional(),
  emergencyContact: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
});

const registerDoctorSchema = z.object({
  email: z.string().email('Invalid email address format').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(100, 'Password is too long'),
  firstName: z.string().min(2, 'First name must have at least 2 characters').trim(),
  lastName: z.string().min(2, 'Last name must have at least 2 characters').trim(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  specialization: z.string().min(2, 'Specialization is required').trim(),
  qualification: z.string().min(2, 'Qualification is required').trim(),
  experienceYears: z.number().int().min(0, 'Experience years must be >= 0').optional().default(0),
  licenseNumber: z.string().min(3, 'Medical license number is required').trim(),
  consultationFee: z.number().min(0, 'Consultation fee must be >= 0').optional().default(0),
  bio: z.string().max(2000).optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }).min(10, 'Invalid refresh token format'),
});

module.exports = {
  registerPatientSchema,
  registerDoctorSchema,
  loginSchema,
  refreshTokenSchema,
};

