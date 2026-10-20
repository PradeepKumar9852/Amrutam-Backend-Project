/**
 * Request validation middleware using Zod schema.
 * @param {import('zod').ZodSchema} schema - Zod schema to validate req.body, req.query, or req.params
 * @param {'body' | 'query' | 'params'} source - Request property to validate (default: 'body')
 */
const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const parsed = schema.parse(req[source]);
      req[source] = parsed; // Assign parsed and sanitized data back to request
      next();
    } catch (error) {
      next(error); // Caught by centralized errorHandler which handles ZodError
    }
  };
};

module.exports = validateRequest;
