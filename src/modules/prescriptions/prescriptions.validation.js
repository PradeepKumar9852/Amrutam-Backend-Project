const { z } = require('zod');

const prescriptionItemSchema = z.object({
  medicineName: z
    .string()
    .min(2, 'Medicine name must have at least 2 characters')
    .max(200, 'Medicine name too long')
    .trim(),
  dosage: z
    .string()
    .min(1, 'Dosage is required (e.g. 1 tablet, 5ml)')
    .max(100)
    .trim(),
  frequency: z
    .string()
    .min(1, 'Frequency is required (e.g. Twice daily after food)')
    .max(100)
    .trim(),
  duration: z
    .string()
    .min(1, 'Duration is required (e.g. 15 days, 1 month)')
    .max(100)
    .trim(),
  instructions: z.string().max(500, 'Instructions too long').optional(),
});

const createPrescriptionSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation UUID format'),
  diagnosis: z
    .string()
    .min(3, 'Diagnosis must have at least 3 characters')
    .max(2000, 'Diagnosis text too long')
    .trim(),
  notes: z
    .string()
    .max(3000, 'Ayurvedic lifestyle notes/pathya-apathya advice too long')
    .optional(),
  items: z
    .array(prescriptionItemSchema)
    .min(1, 'At least one medicine item must be prescribed'),
});

const prescriptionQuerySchema = z.object({
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
  doctorId: z.string().uuid('Invalid doctorId UUID').optional(),
  patientId: z.string().uuid('Invalid patientId UUID').optional(),
});

module.exports = {
  createPrescriptionSchema,
  prescriptionQuerySchema,
};
