import { prisma } from '../../lib/prisma';
import { cacheRedis } from '../../lib/cacheRedis.client';

export interface SearchResults {
  artists: any[];
  tracks: any[];
  albums: any[];
  playlists: any[];
}

export const searchAll = async (
  query: string,
  userId: string | null,
): Promise<SearchResults> => {
  const cleanQuery = query.trim();
  const isShortQuery = cleanQuery.length < 3;

  const cacheKey = `search:raw:${cleanQuery}`;
  let rawResults: SearchResults | null = null;

  try {
    const cached = await cacheRedis.get(cacheKey);
    if (cached) {
      rawResults = JSON.parse(cached);
    }
  } catch (error) {
    // Fail silently on cache read error
  }

  if (!rawResults) {
    let artists: any[] = [];
    let tracks: any[] = [];
    let albums: any[] = [];
    let playlists: any[] = [];

    if (isShortQuery) {
      const ilikePattern = `%${cleanQuery}%`;

      // 1. Parallel ILIKE queries with deterministic sorting (position and string length)
      const [artistsRes, tracksRes, albumsRes, playlistsRes] =
        await Promise.all([
          prisma.$queryRaw<any[]>`
        SELECT id, artist_name AS "artistName", bio, verified, created_at AS "createdAt"
        FROM artist_profiles
        WHERE artist_name ILIKE ${ilikePattern}
        ORDER BY position(lower(${cleanQuery}) in lower(artist_name)) ASC, length(artist_name) ASC, verified DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT t.id, t.artist_id AS "artistId", t.album_id AS "albumId", t.title, t.duration_seconds AS "durationSeconds", t.audio_url AS "audioUrl", t.state, t.created_at AS "createdAt", t.play_count AS "playCount", t.like_count AS "likeCount",
               ap.artist_name AS "artistName"
        FROM tracks t
        JOIN artist_profiles ap ON t.artist_id = ap.id
        WHERE t.title ILIKE ${ilikePattern} AND t.state = 'ready'
        ORDER BY position(lower(${cleanQuery}) in lower(t.title)) ASC, length(t.title) ASC, t.play_count DESC, t.like_count DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT a.id, a.artist_id AS "artistId", a.title, a.cover_art_url AS "coverArtUrl", a.release_date AS "releaseDate", a.status, a.created_at AS "createdAt",
               ap.artist_name AS "artistName"
        FROM albums a
        JOIN artist_profiles ap ON a.artist_id = ap.id
        WHERE a.title ILIKE ${ilikePattern} AND a.status = 'PUBLISHED'
        ORDER BY position(lower(${cleanQuery}) in lower(a.title)) ASC, length(a.title) ASC, a.release_date DESC, a.created_at DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT p.id, p.user_id AS "userId", p.name, p.thumbnail_url AS "thumbnailUrl", p.is_public AS "isPublic", p.created_at AS "createdAt",
               u.display_name AS "creatorName"
        FROM playlists p
        JOIN users u ON p.user_id = u.id
        WHERE p.name ILIKE ${ilikePattern} AND p.is_public = true
        ORDER BY position(lower(${cleanQuery}) in lower(p.name)) ASC, length(p.name) ASC, p.created_at DESC
        LIMIT 5;
      `,
        ]);

      artists = artistsRes;
      tracks = tracksRes;
      albums = albumsRes;
      playlists = playlistsRes;
    } else {
      // 2. Parallel trigram similarity queries with ranking and popularity tie-breakers
      const [artistsRes, tracksRes, albumsRes, playlistsRes] =
        await Promise.all([
          prisma.$queryRaw<any[]>`
        SELECT id, artist_name AS "artistName", bio, verified, created_at AS "createdAt",
               similarity(artist_name, ${cleanQuery}) AS similarity
        FROM artist_profiles
        WHERE artist_name % ${cleanQuery}
        ORDER BY similarity DESC, verified DESC, created_at DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT t.id, t.artist_id AS "artistId", t.album_id AS "albumId", t.title, t.duration_seconds AS "durationSeconds", t.audio_url AS "audioUrl", t.state, t.created_at AS "createdAt", t.play_count AS "playCount", t.like_count AS "likeCount",
               ap.artist_name AS "artistName",
               similarity(t.title, ${cleanQuery}) AS similarity
        FROM tracks t
        JOIN artist_profiles ap ON t.artist_id = ap.id
        WHERE t.title % ${cleanQuery} AND t.state = 'ready'
        ORDER BY similarity DESC, t.play_count DESC, t.like_count DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT a.id, a.artist_id AS "artistId", a.title, a.cover_art_url AS "coverArtUrl", a.release_date AS "releaseDate", a.status, a.created_at AS "createdAt",
               ap.artist_name AS "artistName",
               similarity(a.title, ${cleanQuery}) AS similarity
        FROM albums a
        JOIN artist_profiles ap ON a.artist_id = ap.id
        WHERE a.title % ${cleanQuery} AND a.status = 'PUBLISHED'
        ORDER BY similarity DESC, a.release_date DESC, a.created_at DESC
        LIMIT 5;
      `,
          prisma.$queryRaw<any[]>`
        SELECT p.id, p.user_id AS "userId", p.name, p.thumbnail_url AS "thumbnailUrl", p.is_public AS "isPublic", p.created_at AS "createdAt",
               u.display_name AS "creatorName",
               similarity(p.name, ${cleanQuery}) AS similarity
        FROM playlists p
        JOIN users u ON p.user_id = u.id
        WHERE p.name % ${cleanQuery} AND p.is_public = true
        ORDER BY similarity DESC, p.created_at DESC
        LIMIT 5;
      `,
        ]);

      artists = artistsRes;
      tracks = tracksRes;
      albums = albumsRes;
      playlists = playlistsRes;
    }

    rawResults = {
      artists,
      tracks,
      albums,
      playlists,
    };

    try {
      await cacheRedis.set(cacheKey, JSON.stringify(rawResults), 'EX', 300); // 5 min TTL
    } catch (error) {
      // Fail silently on cache write error
    }
  }

  let tracks = [...rawResults.tracks];

  // 3. Hydrate isLiked for tracks if user is authenticated
  if (userId && tracks.length > 0) {
    const trackIds = tracks.map((t) => t.id);
    const likedTrackIds = await prisma.trackLike
      .findMany({
        where: { userId, trackId: { in: trackIds } },
        select: { trackId: true },
      })
      .then((likes) => new Set(likes.map((l) => l.trackId)));

    tracks = tracks.map((t) => ({
      ...t,
      isLiked: likedTrackIds.has(t.id),
    }));
  } else {
    tracks = tracks.map((t) => ({
      ...t,
      isLiked: false,
    }));
  }

  return {
    artists: rawResults.artists,
    tracks,
    albums: rawResults.albums,
    playlists: rawResults.playlists,
  };
};
