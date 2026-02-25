import type { Request, Response } from 'express';
import * as artistService from './artist.service';
import type { User } from '@prisma/client';

export const createMyProfile = async (req: Request, res: Response) => {
  const user = req.user as User;
  const profile = await artistService.createProfile(user.id, req.body);
  return res.status(201).json(profile);
};

export const getProfileByName = async (req: Request, res: Response) => {
  const { artistName } = req.params;
  const profile = await artistService.getProfileByName(artistName as string);
  return res.json(profile);
};

export const getProfileById = async (req: Request, res: Response) => {
  const { id } = req.params;
  const profile = await artistService.getProfileById(id as string);
  return res.json(profile);
};

export const updateMyProfile = async (req: Request, res: Response) => {
  const user = req.user as User;
  const profile = await artistService.updateProfile(user.id, req.body);
  return res.json(profile);
};
