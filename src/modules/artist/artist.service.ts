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
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      _count: {
        select: {
          followers: true,
          tracks: {
            where: { state: 'ready' }, // Only count ready tracks
          },
          albums: true,
        },
      },
    },
  });

  // If the user is soft-deleted, the extension makes profile return null automatically
  if (!profile || profile.user?.isBlocked) {
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
  offset: number,
): Promise<{
  followers: Array<{ id: string; displayName: string; followedAt: Date }>;
  total: number;
}> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });
  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  const [followersRaw, total] = await Promise.all([
    prisma.artistFollower.findMany({
      where: { artistId },
      skip: offset,
      take: limit,
      select: {
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.artistFollower.count({
      where: { artistId },
    }),
  ]);

  const followers = followersRaw.map((f) => ({
    id: f.user.id,
    displayName: f.user.displayName,
    followedAt: f.createdAt,
  }));

  return { followers, total };
};
