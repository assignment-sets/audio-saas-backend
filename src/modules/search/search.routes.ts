import { Router } from 'express';
import * as searchController from './search.controller';
import { searchQuerySchema } from './search.schema';
import { validate } from '../../middleware/validation/validate.middleware';
import { optionalAuth } from '../../middleware/auth/optionalAuth.middleware';
import { catchAsync } from '../../middleware/errorHandling/asyncWrapper';

const router = Router();

router.get(
  '/',
  catchAsync(optionalAuth),
  validate(searchQuerySchema, 'query'),
  catchAsync(searchController.search),
);

export default router;
