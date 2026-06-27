import type { ArtistProfile, Track } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type {
  CreateArtistInput,
  UpdateArtistInput,
  ArtistProfileWithRelations,
} from './artist.schema';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';
import { fgaClient } from '../../lib/fga.client';
import { addArtistJob } from '../../lib/queue.client';
import { JobName } from '../../queues/types';
import { OutboxStatus, Prisma } from '@prisma/client';
import { OutboxIntentTypes } from '../../config/constants/constants';

// Centralized Prisma error handler to reduce boilerplate
const handlePrismaError = (
  error: unknown,
  actionMsg: string,
  logMeta: object,
) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes('user_id')) {
        throw new BadRequestError(
          'Artist profile already exists for this user',
        );
      }
      if (target?.includes('artist_name')) {
        throw new BadRequestError('Artist name is already taken');
      }
      throw new BadRequestError('A unique constraint failed');
    }
    if (error.code === 'P2025') {
      throw new NotFoundError('Artist profile not found');
    }
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error({ err: errorMessage, ...logMeta }, `Failed to ${actionMsg}`);
  throw new BadRequestError(`Could not ${actionMsg} at this time`);
};

export const createProfile = async (
  userId: string,
  data: CreateArtistInput,
): Promise<ArtistProfile> => {
  try {
    const { profile, outboxTask } = await prisma.$transaction(async (tx) => {
      const newProfile = await tx.artistProfile.create({
        data: {
          userId,
          artistName: data.artistName,
          bio: data.bio,
        },
      });

      // Use Prisma.InputJsonObject to enforce strict type safety without `any`
      const payload: Prisma.InputJsonObject = {
        userId,
        profileId: newProfile.id,
      };

      const task = await tx.outbox.create({
        data: {
          type: OutboxIntentTypes.CREATE_ARTIST_PROFILE,
          payload,
          status: OutboxStatus.PENDING,
        },
      });

      return { profile: newProfile, outboxTask: task };
    });

    try {
      await addArtistJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
    } catch (queueError: unknown) {
      const msg =
        queueError instanceof Error ? queueError.message : String(queueError);
      logger.error(
        { err: msg, outboxId: outboxTask.id },
        'Failed to add outbox job to queue immediately, will be picked up by sweeper',
      );
    }

    return profile;
  } catch (error: unknown) {
    handlePrismaError(error, 'create artist profile', { userId });
    // This return is unreachable because handlePrismaError throws,
    // but TS might complain without a return or assert never depending on strict settings.
    throw error;
  }
};

export const getProfileByName = async (
  artistName: string,
  userId?: string,
): Promise<ArtistProfileWithRelations> => {
  const profile = await prisma.artistProfile.findUnique({
    where: { artistName },
    include: {
      user: {
        select: { isBlocked: true }, // deletedAt is handled by the Prisma extension
      },
      albums: {
        where: {
          status: 'PUBLISHED',
        },
        orderBy: { releaseDate: 'desc' },
        take: 5,
      },
      tracks: {
        where: {
          state: 'ready', // Track uses state instead of deletedAt
        },
        include: {
          likes: userId
            ? {
                where: { userId },
                select: { userId: true },
              }
            : undefined,
        },
        orderBy: [{ playCount: 'desc' }, { likeCount: 'desc' }],
        take: 5,
      },
      _count: {
        select: {
          followers: true,
          tracks: {
            where: { state: 'ready' }, // Only count ready tracks
          },
          albums: {
            where: { status: 'PUBLISHED' },
          },
        },
      },
    },
  });

  // If the user is soft-deleted or blocked, treat as not found
  if (!profile || !profile.user || profile.user.isBlocked) {
    throw new NotFoundError('Artist not found');
  }

  const tracks = profile.tracks.map((track) => {
    const { likes, ...rest } = track;
    return {
      ...rest,
      isLiked: likes ? likes.length > 0 : false,
    } as Track & { isLiked: boolean };
  });

  return {
    ...profile,
    tracks,
  };
};

export const getProfileById = async (
  id: string,
  requesterId: string,
): Promise<ArtistProfile> => {
  const [managerCheck, moderatorCheck] = await Promise.all([
    fgaClient.check({
      user: `user:${requesterId}`,
      relation: 'can_manage',
      object: `artist_profile:${id}`,
    }),
    fgaClient.check({
      user: `user:${requesterId}`,
      relation: 'can_moderate',
      object: `artist_profile:${id}`,
    }),
  ]);

  if (!managerCheck.allowed && !moderatorCheck.allowed) {
    throw new ForbiddenError('Inadequate permissions to access this profile');
  }

  const profile = await prisma.artistProfile.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          followers: true,
          tracks: {
            where: { state: 'ready' }, // Ensure managers see the correct track count
          },
        },
      },
    },
  });

  if (!profile) throw new NotFoundError('Artist profile not found');
  return profile;
};

export const updateProfile = async (
  requesterId: string,
  profileId: string,
  data: UpdateArtistInput,
): Promise<ArtistProfile> => {
  const { allowed } = await fgaClient.check({
    user: `user:${requesterId}`,
    relation: 'can_manage',
    object: `artist_profile:${profileId}`,
  });

  if (!allowed) {
    throw new ForbiddenError(
      'You do not have permission to update this profile',
    );
  }

  try {
    return await prisma.artistProfile.update({
      where: { id: profileId },
      data,
    });
  } catch (error: unknown) {
    handlePrismaError(error, 'update artist profile', {
      requesterId,
      profileId,
    });
    throw error;
  }
};

export const followArtist = async (
  userId: string,
  artistId: string,
): Promise<void> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });
  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  try {
    await prisma.artistFollower.upsert({
      where: {
        userId_artistId: { userId, artistId },
      },
      update: {},
      create: { userId, artistId },
    });
  } catch (error: unknown) {
    handlePrismaError(error, 'follow artist', { userId, artistId });
  }
};

export const unfollowArtist = async (
  userId: string,
  artistId: string,
): Promise<void> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });
  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  try {
    await prisma.artistFollower.delete({
      where: {
        userId_artistId: { userId, artistId },
      },
    });
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return;
    }
    handlePrismaError(error, 'unfollow artist', { userId, artistId });
  }
};

export const checkFollowingStatus = async (
  userId: string,
  artistId: string,
): Promise<boolean> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });
  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  const follower = await prisma.artistFollower.findUnique({
    where: {
      userId_artistId: { userId, artistId },
    },
  });

  return !!follower;
};

export const getArtistFollowers = async (
  artistId: string,
  limit: number,
  cursor?: string,
): Promise<{
  followers: Array<{ id: string; displayName: string; followedAt: Date }>;
  nextCursor: string | null;
  hasMore: boolean;
}> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });
  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  const take = limit + 1;
  const followersRaw = await prisma.artistFollower.findMany({
    where: { artistId },
    take,
    skip: cursor ? 1 : undefined,
    cursor: cursor
      ? {
          userId_artistId: {
            userId: cursor,
            artistId,
          },
        }
      : undefined,
    select: {
      createdAt: true,
      user: {
        select: {
          id: true,
          displayName: true,
        },
      },
    },
    orderBy: { userId: 'asc' },
  });

  const hasMore = followersRaw.length > limit;
  const data = hasMore ? followersRaw.slice(0, limit) : followersRaw;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1]!.user.id : null;

  const followers = data.map((f) => ({
    id: f.user.id,
    displayName: f.user.displayName,
    followedAt: f.createdAt,
  }));

  return { followers, nextCursor, hasMore };
};

export const appointManager = async (
  requesterId: string,
  artistId: string,
  email: string,
): Promise<void> => {
  // 1. Verify that the requester is the owner of the artist profile
  const { allowed } = await fgaClient.check({
    user: `user:${requesterId}`,
    relation: 'owner',
    object: `artist_profile:${artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Only the artist owner can appoint managers.');
  }

  // 2. Fetch the artist profile to verify it exists and get its owner info
  const profile = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });

  if (!profile) {
    throw new NotFoundError('Artist profile not found.');
  }

  // 3. Find the target user by email
  const targetUser = await prisma.user.findUnique({
    where: { email },
  });

  if (!targetUser) {
    throw new NotFoundError('User with this email not found.');
  }

  if (targetUser.isBlocked || targetUser.deletedAt) {
    throw new BadRequestError(
      'Cannot appoint a deactivated user as a manager.',
    );
  }

  // 4. Ensure target user is not already the owner
  if (profile.userId === targetUser.id) {
    throw new BadRequestError(
      'The owner of the artist profile cannot be appointed as a manager.',
    );
  }

  // 5. Check if relation already exists in database
  const existingManager = await prisma.artistManager.findUnique({
    where: {
      artistId_userId: { artistId, userId: targetUser.id },
    },
  });

  if (existingManager) {
    throw new BadRequestError(
      'This user is already a manager of the artist profile.',
    );
  }

  // 6. Execute database transaction
  const outboxTask = await prisma.$transaction(async (tx) => {
    // Check total count of managers
    const managerCount = await tx.artistManager.count({
      where: { artistId },
    });

    if (managerCount >= 5) {
      throw new BadRequestError(
        'An artist profile can have a maximum of 5 managers. Please revoke an existing manager first.',
      );
    }

    // Create relation record
    await tx.artistManager.create({
      data: {
        artistId,
        userId: targetUser.id,
      },
    });

    // Create Outbox task
    const payload: Prisma.InputJsonObject = {
      artistId,
      userId: targetUser.id,
    };

    return await tx.outbox.create({
      data: {
        type: OutboxIntentTypes.APPOINT_ARTIST_MANAGER,
        payload,
        status: OutboxStatus.PENDING,
      },
    });
  });

  // 7. Queue the Outbox task
  try {
    await addArtistJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
  } catch (queueError: unknown) {
    const msg =
      queueError instanceof Error ? queueError.message : String(queueError);
    logger.error(
      { err: msg, outboxId: outboxTask.id },
      'Failed to queue outbox task to process manager appointment immediately',
    );
  }
};

export const revokeManager = async (
  requesterId: string,
  artistId: string,
  managerId: string,
): Promise<void> => {
  // 1. Verify that the requester is the owner of the artist profile
  const { allowed } = await fgaClient.check({
    user: `user:${requesterId}`,
    relation: 'owner',
    object: `artist_profile:${artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Only the artist owner can revoke managers.');
  }

  // 2. Verify the artist profile exists
  const profile = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });

  if (!profile) {
    throw new NotFoundError('Artist profile not found.');
  }

  // 3. Check if target user is actually a manager in database
  const managerRelation = await prisma.artistManager.findUnique({
    where: {
      artistId_userId: { artistId, userId: managerId },
    },
  });

  if (!managerRelation) {
    throw new NotFoundError('Manager relationship not found.');
  }

  // 4. Execute database transaction
  const outboxTask = await prisma.$transaction(async (tx) => {
    // Delete relation record
    await tx.artistManager.delete({
      where: {
        artistId_userId: { artistId, userId: managerId },
      },
    });

    // Create Outbox task
    const payload: Prisma.InputJsonObject = {
      artistId,
      userId: managerId,
    };

    return await tx.outbox.create({
      data: {
        type: OutboxIntentTypes.REVOKE_ARTIST_MANAGER,
        payload,
        status: OutboxStatus.PENDING,
      },
    });
  });

  // 5. Queue the Outbox task
  try {
    await addArtistJob(JobName.PROCESS_OUTBOX, { outboxId: outboxTask.id });
  } catch (queueError: unknown) {
    const msg =
      queueError instanceof Error ? queueError.message : String(queueError);
    logger.error(
      { err: msg, outboxId: outboxTask.id },
      'Failed to queue outbox task to process manager revocation immediately',
    );
  }
};

export const listManagers = async (
  requesterId: string,
  artistId: string,
): Promise<Array<{ id: string; email: string; displayName: string }>> => {
  // 1. Verify that the requester is allowed to manage the artist profile (owners, managers, admins)
  const { allowed } = await fgaClient.check({
    user: `user:${requesterId}`,
    relation: 'can_manage',
    object: `artist_profile:${artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to view managers list.');
  }

  // 2. Fetch managers directly from DB
  const managerRelations = await prisma.artistManager.findMany({
    where: { artistId },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return managerRelations.map((m) => m.user);
};
