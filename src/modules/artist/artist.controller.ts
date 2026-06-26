import type { Request, Response } from 'express';
import * as artistService from './artist.service';
import type { User } from '@prisma/client';
import type { GetFollowersQueryInput } from './artist.schema';

export const createMyProfile = async (req: Request, res: Response) => {
  const user = req.user as User;
  const profile = await artistService.createProfile(user.id, req.body);
  return res.status(201).json(profile);
};

export const getProfileByName = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { artistName } = req.params;

  const profile = await artistService.getProfileByName(
    artistName as string,
    user?.id ?? undefined,
  );
  return res.json(profile);
};

export const getProfileById = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const profile = await artistService.getProfileById(id as string, user.id);
  return res.json(profile);
};

export const updateProfile = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params; // Expecting /artist/:id
  const profile = await artistService.updateProfile(
    user.id,
    id as string,
    req.body,
  );
  return res.json(profile);
};

export const followArtist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await artistService.followArtist(user.id, id as string);
  return res.status(201).send();
};

export const unfollowArtist = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await artistService.unfollowArtist(user.id, id as string);
  return res.status(204).send();
};

export const getFollowingStatus = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const isFollowing = await artistService.checkFollowingStatus(
    user.id,
    id as string,
  );
  return res.json({ isFollowing });
};

export const getArtistFollowers = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { limit, offset } = req.query as unknown as GetFollowersQueryInput;
  const result = await artistService.getArtistFollowers(
    id as string,
    limit,
    offset,
  );
  return res.json(result);
};

export const appointManager = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const { email } = req.body;

  await artistService.appointManager(user.id, id as string, email as string);
  return res.status(201).json({ message: 'Manager appointed successfully.' });
};

export const revokeManager = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id, managerId } = req.params;

  await artistService.revokeManager(user.id, id as string, managerId as string);
  return res.status(204).send();
};

export const listManagers = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;

  const result = await artistService.listManagers(user.id, id as string);
  return res.json(result);
};
