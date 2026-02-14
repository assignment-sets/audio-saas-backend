// src/modules/users/user.schema.ts ~annotator~
import { z } from "zod";

export const syncUserSchema = z.object({
  id: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1).optional(),
});

export const getUserSchema = z.object({
  id: z.string().min(1),
});

export const updateUserSchema = z.object({
  displayName: z.string().min(1).optional(),
  email: z.email().optional(),
});

export type SyncUserInput = z.infer<typeof syncUserSchema>;
export type GetUserInput = z.infer<typeof getUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
