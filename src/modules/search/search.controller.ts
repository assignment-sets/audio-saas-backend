import type { Request, Response } from 'express';
import * as searchService from './search.service';
import type { User } from '@prisma/client';

export const search = async (req: Request, res: Response) => {
  const { q } = req.query;
  const user = req.user as User | undefined;
  const userId = user ? user.id : null;

  const results = await searchService.searchAll(q as string, userId);
  return res.json(results);
};
