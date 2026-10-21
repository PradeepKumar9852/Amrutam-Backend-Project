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
  mfaCode: z.string().min(6).max(20).optional(),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string({ required_error: 'Refresh token is required' }).min(10, 'Invalid refresh token format'),
});

const enableMfaSchema = z.object({
  token: z
    .string({ required_error: 'Verification code is required' })
    .regex(/^\d{6}$/, 'MFA token must be a 6-digit numeric string'),
});

const disableMfaSchema = z.object({
  password: z.string().min(1, 'Password is required to disable MFA'),
  token: z.string().min(6, 'MFA token or recovery code is required'),
});

const verifyMfaLoginSchema = z.object({
  tempToken: z.string({ required_error: 'MFA challenge token is required' }).min(10),
  mfaCode: z.string({ required_error: 'MFA 6-digit code or backup code is required' }).min(6),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters long')
    .max(100, 'New password is too long'),
});

const updateProfileSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number format').optional(),
  dateOfBirth: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  bloodGroup: z.string().max(10).optional(),
  emergencyContact: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  bio: z.string().max(2000).optional(),
  consultationFee: z.number().min(0).optional(),
  experienceYears: z.number().int().min(0).optional(),
});

const deactivateAccountSchema = z.object({
  password: z.string().min(1, 'Password is required to deactivate account'),
  reason: z.string().max(500).optional(),
});

const revokeTokenSchema = z.object({
  token: z.string({ required_error: 'Token to revoke is required' }).min(10),
});

module.exports = {
  registerPatientSchema,
  registerDoctorSchema,
  loginSchema,
  refreshTokenSchema,
  enableMfaSchema,
  disableMfaSchema,
  verifyMfaLoginSchema,
  changePasswordSchema,
  updateProfileSchema,
  deactivateAccountSchema,
  revokeTokenSchema,
};
