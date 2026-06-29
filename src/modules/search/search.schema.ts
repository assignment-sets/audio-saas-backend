import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty').max(100),
});

export type SearchQueryInput = z.infer<typeof searchQuerySchema>;
