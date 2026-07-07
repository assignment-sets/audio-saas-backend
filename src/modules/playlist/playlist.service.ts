import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  PaymentRequiredError,
} from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';
import type { Playlist, Track, Prisma } from '@prisma/client';
import type {
  CreatePlaylistInput,
  UpdatePlaylistInput,
} from './playlist.schema';
import { getUserTier, UserTier } from '../users/user.service';
import { SUBSCRIPTION_LIMITS } from '../../config/constants/subscriptionLimits';

/**
 * Resequences the positions of all specified tracks in a playlist using a single raw SQL bulk query.
 */
const bulkUpdateTrackPositions = async (
  tx: any,
  playlistId: string,
  trackIds: string[],
): Promise<void> => {
  if (trackIds.length === 0) return;

  const cases = trackIds
    .map((trackId, index) => `WHEN '${trackId}'::uuid THEN ${index + 1}`)
    .join('\n');

  const query = `
    UPDATE playlist_tracks
    SET position = CASE track_id
      ${cases}
    END
    WHERE playlist_id = '${playlistId}'::uuid;
  `;

  await tx.$executeRawUnsafe(query);
};

export const createPlaylist = async (
  userId: string,
  data: CreatePlaylistInput,
): Promise<Playlist> => {
  // Execute transactional checks
  return await prisma.$transaction(async (tx) => {
    // Enforce tier-based limits (quantity and privacy)
    await enforcePlaylistLimits(tx, userId, true, data.isPublic);

    // 2. Create Playlist record
    const playlist = await tx.playlist.create({
      data: {
        userId,
        name: data.name,
        isPublic: data.isPublic,
        thumbnailUrl: data.thumbnailUrl,
      },
    });

    // 3. Write OpenFGA relationships sequentially
    try {
      await fgaClient.write({
        writes: [
          {
            user: `user:${userId}`,
            relation: 'owner',
            object: `playlist:${playlist.id}`,
          },
          {
            user: 'platform:mainApp',
            relation: 'platform_ref',
            object: `playlist:${playlist.id}`,
          },
        ],
      });
    } catch (fgaError: unknown) {
      const msg =
        fgaError instanceof Error ? fgaError.message : String(fgaError);
      logger.error(
        { err: msg, playlistId: playlist.id },
        'Failed to write OpenFGA tuples for playlist',
      );
      throw new BadRequestError(
        'Failed to register authorization tuples for playlist',
      );
    }

    return playlist;
  });
};

export const getPlaylistById = async (
  userId: string | null,
  id: string,
): Promise<any> => {
  const playlist = await prisma.playlist.findUnique({
    where: { id },
    include: {
      tracks: {
        orderBy: { position: 'asc' },
        include: {
          track: {
            include: {
              likes: userId
                ? {
                    where: { userId },
                    select: { userId: true },
                  }
                : undefined,
            },
          },
        },
      },
    },
  });

  if (!playlist) {
    throw new NotFoundError('Playlist not found');
  }

  // If playlist is private, verify can_view access via OpenFGA
  if (!playlist.isPublic) {
    if (!userId) {
      throw new ForbiddenError('Access to private playlist is restricted');
    }

    const { allowed } = await fgaClient.check({
      user: `user:${userId}`,
      relation: 'can_view',
      object: `playlist:${id}`,
    });

    if (!allowed) {
      throw new ForbiddenError('Access to private playlist is restricted');
    }
  }

  // Filter only valid/ready tracks, and map properties
  const tracksMapped = playlist.tracks
    .filter((pt) => pt.track.state === 'ready')
    .map((pt) => {
      const track = pt.track;
      const { likes, ...rest } = track as any;
      return {
        ...rest,
        position: pt.position,
        addedAt: pt.addedAt,
        isLiked: likes ? likes.length > 0 : false,
      };
    });

  const { tracks, ...playlistDetails } = playlist;
  return {
    ...playlistDetails,
    tracks: tracksMapped,
  };
};

export const updatePlaylist = async (
  userId: string,
  id: string,
  data: UpdatePlaylistInput,
): Promise<Playlist> => {
  // 1. FGA Authorization Check
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `playlist:${id}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to edit this playlist');
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id },
  });

  if (!playlist) {
    throw new NotFoundError('Playlist not found');
  }

  return await prisma.$transaction(async (tx) => {
    // Enforce tier-based limits (privacy rules on updates)
    await enforcePlaylistLimits(tx, userId, false, data.isPublic);

    // A. Update metadata
    const updatedPlaylist = await tx.playlist.update({
      where: { id },
      data: {
        name: data.name,
        isPublic: data.isPublic,
        thumbnailUrl: data.thumbnailUrl,
      },
    });

    // B. Handle tracklist reordering
    if (data.trackOrder && data.trackOrder.length > 0) {
      const existingTracks = await tx.playlistTrack.findMany({
        where: { playlistId: id },
        select: { trackId: true },
      });
      const existingTrackIdsSet = new Set(existingTracks.map((t) => t.trackId));

      // Validate reorder payload completeness and presence
      for (const trackId of data.trackOrder) {
        if (!existingTrackIdsSet.has(trackId)) {
          throw new BadRequestError(
            `Track ${trackId} does not exist in this playlist`,
          );
        }
      }

      if (data.trackOrder.length !== existingTrackIdsSet.size) {
        throw new BadRequestError(
          'trackOrder length must match the current number of tracks in the playlist',
        );
      }

      // Re-sequence positions sequentially (1 to N) using one bulk Raw SQL query
      await bulkUpdateTrackPositions(tx, id, data.trackOrder);
    }

    return updatedPlaylist;
  });
};

export const deletePlaylist = async (
  userId: string,
  id: string,
): Promise<void> => {
  // 1. FGA Authorization Check
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_delete',
    object: `playlist:${id}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to delete this playlist');
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id },
  });

  if (!playlist) {
    throw new NotFoundError('Playlist not found');
  }

  // 2. Cascade delete database records
  await prisma.playlist.delete({
    where: { id },
  });

  // 3. Purge OpenFGA tuples
  try {
    await fgaClient.write({
      deletes: [
        {
          user: `user:${playlist.userId}`,
          relation: 'owner',
          object: `playlist:${id}`,
        },
        {
          user: 'platform:mainApp',
          relation: 'platform_ref',
          object: `playlist:${id}`,
        },
      ],
    });
  } catch (fgaError: unknown) {
    const msg = fgaError instanceof Error ? fgaError.message : String(fgaError);
    logger.warn(
      { err: msg, playlistId: id },
      'OpenFGA tuples already purged or failed to remove on playlist delete',
    );
  }
};

export const addTracksToPlaylist = async (
  userId: string,
  id: string,
  trackIds: string[],
): Promise<void> => {
  // 1. FGA Authorization Check
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `playlist:${id}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to modify this playlist');
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id },
  });

  if (!playlist) {
    throw new NotFoundError('Playlist not found');
  }

  await prisma.$transaction(async (tx) => {
    // 2. Verify all tracks exist and are ready
    const tracks = await tx.track.findMany({
      where: {
        id: { in: trackIds },
      },
    });

    for (const trackId of trackIds) {
      const track = tracks.find((t) => t.id === trackId);
      if (!track) {
        throw new BadRequestError(`Track ${trackId} not found`);
      }
      if (track.state !== 'ready') {
        throw new BadRequestError(`Track ${trackId} is not in a ready state`);
      }
    }

    // 3. Verify target capacity (tier-based limits)
    await enforcePlaylistCapacityLimit(
      tx,
      id,
      playlist.userId,
      trackIds.length,
    );

    // 4. Find current max position to append sequentially
    const maxTrack = await tx.playlistTrack.findFirst({
      where: { playlistId: id },
      orderBy: { position: 'desc' },
    });
    let currentMax = maxTrack?.position ?? 0;

    // 5. Insert tracks in bulk, ignoring duplicates already inside the playlist
    const existingPlaylistTracks = await tx.playlistTrack.findMany({
      where: {
        playlistId: id,
        trackId: { in: trackIds },
      },
      select: { trackId: true },
    });
    const existingSet = new Set(existingPlaylistTracks.map((pt) => pt.trackId));

    const newTracksToInsert = [];
    for (const trackId of trackIds) {
      if (!existingSet.has(trackId)) {
        currentMax += 1;
        newTracksToInsert.push({
          playlistId: id,
          trackId,
          position: currentMax,
        });
      }
    }

    if (newTracksToInsert.length > 0) {
      await tx.playlistTrack.createMany({
        data: newTracksToInsert,
      });
    }
  });
};

export const removeTrackFromPlaylist = async (
  userId: string,
  id: string,
  trackId: string,
): Promise<void> => {
  // 1. FGA Authorization Check
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `playlist:${id}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to modify this playlist');
  }

  const playlist = await prisma.playlist.findUnique({
    where: { id },
  });

  if (!playlist) {
    throw new NotFoundError('Playlist not found');
  }

  await prisma.$transaction(async (tx) => {
    // 2. Verify track is in playlist
    const exists = await tx.playlistTrack.findUnique({
      where: {
        playlistId_trackId: { playlistId: id, trackId },
      },
    });

    if (!exists) {
      throw new NotFoundError('Track not found in this playlist');
    }

    // 3. Delete track link
    await tx.playlistTrack.delete({
      where: {
        playlistId_trackId: { playlistId: id, trackId },
      },
    });

    // 4. Re-sequence positions sequentially using one bulk Raw SQL query to close the gap
    const remainingTracks = await tx.playlistTrack.findMany({
      where: { playlistId: id },
      orderBy: { position: 'asc' },
    });

    const remainingTrackIds = remainingTracks.map((pt) => pt.trackId);
    await bulkUpdateTrackPositions(tx, id, remainingTrackIds);
  });
};

export const searchPlaylists = async (
  userId: string | null,
  search?: string,
  cursor?: string,
  limit: number = 10,
): Promise<{
  data: Playlist[];
  nextCursor: string | null;
  hasMore: boolean;
}> => {
  const take = limit + 1;

  const whereClause: Prisma.PlaylistWhereInput = {
    AND: [
      search ? { name: { contains: search, mode: 'insensitive' } } : {},
      userId ? { OR: [{ isPublic: true }, { userId }] } : { isPublic: true },
    ],
  };

  const playlists = await prisma.playlist.findMany({
    take,
    skip: cursor ? 1 : undefined,
    cursor: cursor ? { id: cursor } : undefined,
    where: whereClause,
    orderBy: { id: 'asc' },
  });

  const hasMore = playlists.length > limit;
  const data = hasMore ? playlists.slice(0, limit) : playlists;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

  return {
    data,
    nextCursor,
    hasMore,
  };
};

export const getUserPlaylists = async (
  requesterId: string | null,
  targetUserId: string,
  cursor?: string,
  limit: number = 10,
): Promise<{
  data: Playlist[];
  nextCursor: string | null;
  hasMore: boolean;
}> => {
  const take = limit + 1;
  const showPrivate = requesterId === targetUserId;

  const whereClause: Prisma.PlaylistWhereInput = {
    userId: targetUserId,
    isPublic: showPrivate ? undefined : true,
  };

  const playlists = await prisma.playlist.findMany({
    take,
    skip: cursor ? 1 : undefined,
    cursor: cursor ? { id: cursor } : undefined,
    where: whereClause,
    orderBy: { id: 'asc' },
  });

  const hasMore = playlists.length > limit;
  const data = hasMore ? playlists.slice(0, limit) : playlists;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

  return {
    data,
    nextCursor,
    hasMore,
  };
};

export const enforcePlaylistLimits = async (
  tx: any,
  userId: string,
  isCreating: boolean,
  requestedPrivacy?: boolean,
): Promise<void> => {
  const subscriptions = await tx.subscription.findMany({
    where: { userId },
  });
  const tier = getUserTier(subscriptions);
  const limits = SUBSCRIPTION_LIMITS[tier];

  if (requestedPrivacy === false && !limits.allowPrivatePlaylists) {
    throw new PaymentRequiredError(
      'Private playlists are only available on paid subscription plans.',
    );
  }

  if (isCreating) {
    const playlistCount = await tx.playlist.count({
      where: { userId },
    });

    if (playlistCount >= limits.maxPlaylists) {
      throw new PaymentRequiredError(
        `Playlist limit reached. Your current tier (${tier}) only allows up to ${limits.maxPlaylists} playlists.`,
      );
    }
  }
};

export const enforcePlaylistCapacityLimit = async (
  tx: any,
  playlistId: string,
  ownerId: string,
  newTracksCount: number,
): Promise<void> => {
  const subscriptions = await tx.subscription.findMany({
    where: { userId: ownerId },
  });
  const tier = getUserTier(subscriptions);
  const limits = SUBSCRIPTION_LIMITS[tier];

  const currentCount = await tx.playlistTrack.count({
    where: { playlistId },
  });

  if (currentCount + newTracksCount > limits.maxTracksPerPlaylist) {
    throw new PaymentRequiredError(
      `Playlist capacity exceeded. Your current tier (${tier}) limits playlists to a maximum of ${limits.maxTracksPerPlaylist} tracks.`,
    );
  }
};
