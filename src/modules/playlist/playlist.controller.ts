import type { Request, Response } from 'express';
import * as playlistService from './playlist.service';
import type { User } from '@prisma/client';

export const createPlaylist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const playlist = await playlistService.createPlaylist(user.id, req.body);
  return res.status(201).json(playlist);
};

export const getPlaylistById = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { id } = req.params;

  const playlist = await playlistService.getPlaylistById(
    user?.id ?? null,
    id as string,
  );
  return res.json(playlist);
};

export const updatePlaylist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;

  const updatedPlaylist = await playlistService.updatePlaylist(
    user.id,
    id as string,
    req.body,
  );
  return res.json(updatedPlaylist);
};

export const deletePlaylist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;

  await playlistService.deletePlaylist(user.id, id as string);
  return res.status(204).send();
};

export const addTracksToPlaylist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const { trackIds } = req.body;

  await playlistService.addTracksToPlaylist(user.id, id as string, trackIds);
  return res.status(201).json({ message: 'Tracks added successfully.' });
};

export const removeTrackFromPlaylist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id, trackId } = req.params;

  await playlistService.removeTrackFromPlaylist(
    user.id,
    id as string,
    trackId as string,
  );
  return res.status(204).send();
};

export const searchPlaylists = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { search, cursor, limit } = req.query as any;

  const result = await playlistService.searchPlaylists(
    user?.id ?? null,
    search as string | undefined,
    cursor as string | undefined,
    limit,
  );
  return res.json(result);
};

export const getUserPlaylists = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { userId } = req.params;
  const { cursor, limit } = req.query as any;

  const result = await playlistService.getUserPlaylists(
    user?.id ?? null,
    userId as string,
    cursor as string | undefined,
    limit,
  );
  return res.json(result);
};
