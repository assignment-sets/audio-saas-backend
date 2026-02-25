import type { ArtistProfile } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { CreateArtistInput, UpdateArtistInput } from './artist.schema';
import { NotFoundError, BadRequestError } from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';

export const createProfile = async (
  userId: string,
  data: CreateArtistInput,
): Promise<ArtistProfile> => {
  // Check if user already has any profile
  const existingProfile = await prisma.artistProfile.findUnique({
    where: { userId },
  });

  if (existingProfile) {
    throw new BadRequestError('Artist profile already exists for this user');
  }

  // Check if artist name is already taken
  const nameTaken = await prisma.artistProfile.findUnique({
    where: { artistName: data.artistName },
  });

  if (nameTaken) {
    throw new BadRequestError('Artist name is already taken');
  }

  try {
    return await prisma.artistProfile.create({
      data: {
        userId,
        artistName: data.artistName,
        bio: data.bio,
      },
    });
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to create artist profile');
    throw error;
  }
};

export const getProfileByName = async (
  artistName: string,
): Promise<ArtistProfile> => {
  const profile = await prisma.artistProfile.findUnique({
    where: { artistName },
    include: {
      user: {
        select: {
          isBlocked: true,
          deletedAt: true,
        },
      },
      _count: {
        select: {
          followers: true,
          tracks: true,
        },
      },
    },
  });

  // Check if profile exists AND if the underlying user is active
  if (!profile || profile.user.isBlocked || profile.user.deletedAt) {
    throw new NotFoundError('Artist not found');
  }

  return profile;
};

export const getProfileById = async (id: string): Promise<ArtistProfile> => {
  const profile = await prisma.artistProfile.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          followers: true,
          tracks: true,
        },
      },
    },
  });

  if (!profile) throw new NotFoundError('Artist profile not found');
  return profile;
};

export const updateProfile = async (
  userId: string,
  data: UpdateArtistInput,
): Promise<ArtistProfile> => {
  try {
    const nameTaken = await prisma.artistProfile.findUnique({
      where: { artistName: data.artistName },
    });

    if (nameTaken) {
      throw new BadRequestError('Artist name is already taken');
    }
    return await prisma.artistProfile.update({
      where: { userId },
      data,
    });
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to update artist profile');
    throw new NotFoundError('Artist profile not found or update failed');
  }
};
