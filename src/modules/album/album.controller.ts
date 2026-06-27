import type { Request, Response } from 'express';
import * as albumService from './album.service';
import type { User } from '@prisma/client';
import type { CreateAlbumInput, UpdateAlbumInput } from './album.schema';

export const createAlbum = async (req: Request, res: Response) => {
  const user = req.user as User;
  const album = await albumService.createAlbum(
    user.id,
    req.body as CreateAlbumInput,
  );
  return res.status(201).json(album);
};

export const updateAlbum = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const album = await albumService.updateAlbum(
    user.id,
    id as string,
    req.body as UpdateAlbumInput,
  );
  return res.json(album);
};

export const publishAlbum = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const album = await albumService.publishAlbum(user.id, id as string);
  return res.json(album);
};

export const deleteAlbum = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await albumService.deleteAlbum(user.id, id as string);
  return res.status(204).send();
};

export const getAlbumById = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { id } = req.params;
  const album = await albumService.getAlbumById(user?.id ?? null, id as string);
  return res.json(album);
};

export const getAlbumsByArtist = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { artistId } = req.params;
  const albums = await albumService.getAlbumsByArtist(
    user?.id ?? null,
    artistId as string,
  );
  return res.json(albums);
};
