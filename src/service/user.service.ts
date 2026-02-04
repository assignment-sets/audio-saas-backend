import { prisma } from "../lib/prisma";
import type { SyncUserInput } from "../schemas/user.schema";
import { logger } from "../config/logger";

export const syncUser = async (data: SyncUserInput) => {
  try {
    const user = await prisma.user.upsert({
      where: { id: data.id },
      update: { email: data.email, displayName: data.displayName },
      create: {
        id: data.id,
        email: data.email,
        displayName: data.displayName || "unknown",
      },
    });

    logger.info({ userId: user.id }, "User synced to database successfully");
    return user;
  } catch (error) {
    logger.error(
      { err: error, userId: data.id },
      "Prisma upsert failed during user sync",
    );
    throw error;
  }
};
