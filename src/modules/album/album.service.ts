import { prisma } from '../../lib/prisma';
import { fgaClient } from '../../lib/fga.client';
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../lib/errors';
import { logger } from '../../config/logging_setup/logger';
import { Prisma } from '@prisma/client';
import type { Album } from '@prisma/client';
import type { CreateAlbumInput, UpdateAlbumInput } from './album.schema';

export const createAlbum = async (
  userId: string,
  data: CreateAlbumInput,
): Promise<Album> => {
  // Check FGA permissions for managing the artist profile
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_manage',
    object: `artist_profile:${data.artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError(
      'Not authorized to create albums for this artist profile',
    );
  }

  // Create album in DRAFT status
  const album = await prisma.album.create({
    data: {
      artistId: data.artistId,
      title: data.title,
      coverArtUrl: data.coverArtUrl,
      releaseDate: data.releaseDate,
      status: 'DRAFT',
    },
  });

  // Synchronously write OpenFGA relation tuples for the album
  try {
    await fgaClient.write({
      writes: [
        {
          user: `artist_profile:${data.artistId}`,
          relation: 'parent_artist',
          object: `album:${album.id}`,
        },
        {
          user: `platform:mainApp`,
          relation: 'platform_ref',
          object: `album:${album.id}`,
        },
      ],
    });
  } catch (fgaError: unknown) {
    const msg = fgaError instanceof Error ? fgaError.message : String(fgaError);
    logger.error(
      { err: msg, albumId: album.id },
      'Failed to write OpenFGA tuples for album',
    );
    // For sequential setup in this sprint, we fail the transaction or log warning.
    // Logging and proceeding is safer to avoid breaking DB state if FGA client is flaky,
    // but throwing ensures absolute parity. Let's throw here to be strict with the model.
    throw new BadRequestError(
      'Failed to register authorization tuples for album',
    );
  }

  return album;
};

export const updateAlbum = async (
  userId: string,
  albumId: string,
  data: UpdateAlbumInput,
): Promise<Album> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found');
  }

  // Check FGA permissions for editing the album
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `album:${albumId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to edit this album');
  }

  // If album is PUBLISHED, block tracklist alterations
  const isTracklistUpdate =
    data.addTrackIds || data.removeTrackIds || data.trackOrder;
  if (album.status === 'PUBLISHED' && isTracklistUpdate) {
    throw new BadRequestError(
      'Cannot modify the tracklist of a published album',
    );
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Update basic text/date metadata
    const updatedAlbum = await tx.album.update({
      where: { id: albumId },
      data: {
        title: data.title,
        coverArtUrl: data.coverArtUrl,
        releaseDate: data.releaseDate,
      },
    });

    // 2. Process removals
    if (data.removeTrackIds && data.removeTrackIds.length > 0) {
      await tx.track.updateMany({
        where: {
          id: { in: data.removeTrackIds },
          albumId: albumId,
        },
        data: {
          albumId: null,
          trackNumber: null,
        },
      });
    }

    // 3. Process additions
    if (data.addTrackIds && data.addTrackIds.length > 0) {
      const addedTracks = await tx.track.findMany({
        where: { id: { in: data.addTrackIds } },
      });

      // Verify each track is valid (same artist and strictly 'ready')
      for (const trackId of data.addTrackIds) {
        const track = addedTracks.find((t) => t.id === trackId);
        if (!track) {
          throw new BadRequestError(`Track ${trackId} not found`);
        }
        if (track.artistId !== album.artistId) {
          throw new BadRequestError(
            `Track ${trackId} does not belong to the album's artist`,
          );
        }
        if (track.state !== 'ready') {
          throw new BadRequestError(`Track ${trackId} is not in a ready state`);
        }
      }

      // Find current max trackNumber to append sequentially
      const maxTrack = await tx.track.findFirst({
        where: { albumId: albumId },
        orderBy: { trackNumber: 'desc' },
      });
      let currentMax = maxTrack?.trackNumber ?? 0;

      for (const trackId of data.addTrackIds) {
        currentMax += 1;
        await tx.track.update({
          where: { id: trackId },
          data: {
            albumId: albumId,
            trackNumber: currentMax,
          },
        });
      }
    }

    // 4. Process reordering (requires a full array of track IDs currently in the album)
    if (data.trackOrder && data.trackOrder.length > 0) {
      const albumTracks = await tx.track.findMany({
        where: { albumId: albumId },
        select: { id: true },
      });
      const albumTrackIdsSet = new Set(albumTracks.map((t) => t.id));

      // Validate that all tracks in trackOrder belong to this album
      for (const trackId of data.trackOrder) {
        if (!albumTrackIdsSet.has(trackId)) {
          throw new BadRequestError(
            `Track ${trackId} does not belong to this album`,
          );
        }
      }

      // Must be a complete list
      if (data.trackOrder.length !== albumTrackIdsSet.size) {
        throw new BadRequestError(
          'trackOrder list length must match the current number of tracks in the album',
        );
      }

      let trackNum = 1;
      for (const trackId of data.trackOrder) {
        await tx.track.update({
          where: { id: trackId },
          data: { trackNumber: trackNum++ },
        });
      }
    } else if (data.removeTrackIds && data.removeTrackIds.length > 0) {
      // If we removed tracks but didn't supply a new trackOrder, re-sequence to remove gaps
      const remainingTracks = await tx.track.findMany({
        where: { albumId: albumId },
        orderBy: { trackNumber: 'asc' },
      });

      let trackNum = 1;
      for (const track of remainingTracks) {
        await tx.track.update({
          where: { id: track.id },
          data: { trackNumber: trackNum++ },
        });
      }
    }

    return updatedAlbum;
  });
};

export const publishAlbum = async (
  userId: string,
  albumId: string,
): Promise<Album> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found');
  }

  if (album.status === 'PUBLISHED') {
    return album;
  }

  // Check FGA permissions for publishing (requires edit rights)
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_edit',
    object: `album:${albumId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to publish this album');
  }

  // Fetch associated tracks to run checks
  const tracks = await prisma.track.findMany({
    where: { albumId: albumId },
  });

  // Guardrail 1: Filter strictly to 'ready' tracks
  const readyTracks = tracks.filter((t) => t.state === 'ready');

  // Guardrail 2: Track count must be between 7 and 30
  if (readyTracks.length < 7 || readyTracks.length > 30) {
    throw new BadRequestError(
      `Cannot publish album: Total of ${readyTracks.length} ready tracks found. Album must contain between 7 and 30 ready tracks.`,
    );
  }

  // Guardrail 3: Playtime duration must be between 20 mins (1,200s) and 150 mins (9,000s)
  const totalDuration = readyTracks.reduce(
    (sum, t) => sum + t.durationSeconds,
    0,
  );
  if (totalDuration < 1200 || totalDuration > 9000) {
    const mins = Math.round(totalDuration / 60);
    throw new BadRequestError(
      `Cannot publish album: Total duration is ${mins} minutes (${totalDuration}s). Playtime must be between 20 and 150 minutes.`,
    );
  }

  // Guardrail 4: All tracks must belong to the album's artistId
  const mismatchedTrack = readyTracks.find(
    (t) => t.artistId !== album.artistId,
  );
  if (mismatchedTrack) {
    throw new BadRequestError(
      'Cannot publish album: Mismatched artist ownership detected on associated tracks.',
    );
  }

  return await prisma.album.update({
    where: { id: albumId },
    data: { status: 'PUBLISHED' },
  });
};

export const deleteAlbum = async (
  userId: string,
  albumId: string,
): Promise<void> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
  });

  if (!album) {
    throw new NotFoundError('Album not found');
  }

  // Check FGA permissions for deleting
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_delete',
    object: `album:${albumId}`,
  });

  if (!allowed) {
    throw new ForbiddenError('Not authorized to delete this album');
  }

  // Delete the album record (tracks' albumId automatically gets set to null due to onDelete: SetNull)
  await prisma.album.delete({
    where: { id: albumId },
  });

  // Delete FGA tuples
  try {
    await fgaClient.write({
      deletes: [
        {
          user: `artist_profile:${album.artistId}`,
          relation: 'parent_artist',
          object: `album:${albumId}`,
        },
        {
          user: `platform:mainApp`,
          relation: 'platform_ref',
          object: `album:${albumId}`,
        },
      ],
    });
  } catch (fgaError: unknown) {
    const msg = fgaError instanceof Error ? fgaError.message : String(fgaError);
    logger.warn(
      { err: msg, albumId },
      'FGA tuples already gone or failed to delete on album removal',
    );
  }
};

export const getAlbumById = async (
  userId: string | null,
  albumId: string,
): Promise<any> => {
  const album = await prisma.album.findUnique({
    where: { id: albumId },
    include: {
      tracks: {
        orderBy: { trackNumber: 'asc' },
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
  });

  if (!album) {
    throw new NotFoundError('Album not found');
  }

  // If album is in DRAFT status, only allow the owner/manager to view it
  if (album.status === 'DRAFT') {
    if (!userId) {
      throw new ForbiddenError('Access to draft album is restricted');
    }

    const { allowed } = await fgaClient.check({
      user: `user:${userId}`,
      relation: 'can_edit',
      object: `album:${albumId}`,
    });

    if (!allowed) {
      throw new ForbiddenError('Access to draft album is restricted');
    }
  }

  const tracks = album.tracks.map((track) => {
    const { likes, ...rest } = track as any;
    return {
      ...rest,
      isLiked: likes ? likes.length > 0 : false,
    };
  });

  return {
    ...album,
    tracks,
  };
};

export const getAlbumsByArtist = async (artistId: string): Promise<Album[]> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });

  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  // Public view: only return PUBLISHED albums
  return await prisma.album.findMany({
    where: {
      artistId,
      status: 'PUBLISHED',
    },
    orderBy: { releaseDate: 'desc' },
  });
};

export const getAlbumsByArtistPrivate = async (
  userId: string,
  artistId: string,
): Promise<any[]> => {
  const artist = await prisma.artistProfile.findUnique({
    where: { id: artistId },
  });

  if (!artist) {
    throw new NotFoundError('Artist profile not found');
  }

  // Check FGA permissions for managing the artist profile
  const { allowed } = await fgaClient.check({
    user: `user:${userId}`,
    relation: 'can_manage',
    object: `artist_profile:${artistId}`,
  });

  if (!allowed) {
    throw new ForbiddenError(
      'Not authorized to view albums for this artist profile',
    );
  }

  // Return all albums (DRAFT and PUBLISHED) with their tracks and likes mapped
  const albums = await prisma.album.findMany({
    where: {
      artistId,
    },
    include: {
      tracks: {
        orderBy: { trackNumber: 'asc' },
        include: {
          likes: {
            where: { userId },
            select: { userId: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return albums.map((album) => {
    const tracksMapped = album.tracks.map((track) => {
      const { likes, ...rest } = track as any;
      return {
        ...rest,
        isLiked: likes ? likes.length > 0 : false,
      };
    });
    return {
      ...album,
      tracks: tracksMapped,
    };
  });
};
