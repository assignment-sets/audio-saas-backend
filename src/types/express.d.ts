import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: User; // This makes req.user available and typed everywhere
    }
  }
}
