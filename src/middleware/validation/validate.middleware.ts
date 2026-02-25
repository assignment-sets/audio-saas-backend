import type { Request, Response, NextFunction } from 'express';
import { ZodObject } from 'zod';
import { ValidationError } from '../../lib/errors';

type ValidationTarget = 'body' | 'params' | 'query';

/**
 * Higher-order middleware to validate request body against a Zod schema.
 * It automatically throws a ValidationError if parsing fails.
 */

export const validate = (
  schema: ZodObject,
  target: ValidationTarget = 'body',
) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const result = await schema.safeParseAsync(req[target]);

      if (!result.success) {
        return next(
          new ValidationError(
            `Validation failed in ${target}`,
            result.error.issues,
          ),
        );
      }

      // Re-assign validated data to the correct request property
      (req as any)[target] = result.data;
      next();
    } catch (error) {
      next(error);
    }
  };
};
