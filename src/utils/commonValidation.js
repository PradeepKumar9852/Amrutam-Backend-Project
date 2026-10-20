const { z } = require('zod');

/**
 * Common parameter validation schemas for route identifiers
 */
const uuidParamSchema = z.object({
  id: z.string().uuid('Invalid resource UUID identifier format'),
});

const slotIdParamSchema = z.object({
  slotId: z.string().uuid('Invalid slot UUID identifier format'),
});

const consultationIdParamSchema = z.object({
  consultationId: z.string().uuid('Invalid consultation UUID identifier format'),
});

module.exports = {
  uuidParamSchema,
  slotIdParamSchema,
  consultationIdParamSchema,
};
