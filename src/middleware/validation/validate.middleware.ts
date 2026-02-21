import type { Request, Response, NextFunction } from 'express';
import { ZodObject } from 'zod';
import { ValidationError } from '../../lib/errors';

/**
 * Higher-order middleware to validate request body against a Zod schema.
 * It automatically throws a ValidationError if parsing fails.
 */
export const validate = (schema: ZodObject) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync(req.body);

      if (!result.success) {
        // Pass to your global error handler with the Zod issues
        return next(
          new ValidationError('Validation failed', result.error.issues),
        );
      }

      // Important: replace req.body with the parsed data.
      // This ensures any .strip() or .transform() in schema is applied.
      req.body = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
};
