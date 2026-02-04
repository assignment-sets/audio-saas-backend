import { z } from "zod";

export const syncUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1).optional(),
});

export type SyncUserInput = z.infer<typeof syncUserSchema>;
