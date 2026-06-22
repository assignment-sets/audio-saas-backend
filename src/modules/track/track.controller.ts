import type { Request, Response } from 'express';
import * as trackService from './track.service';
import type { User } from '@prisma/client';
import { env } from '../../config/env_setup/env';

export const getTracksByArtist = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { artistId } = req.params;
  const tracks = await trackService.getTracksByArtist(
    artistId as string,
    user?.id ?? undefined,
  );
  return res.json(tracks);
};

export const getTrackById = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const track = await trackService.getTrackById(user.id, id as string);
  return res.json(track);
};

export const createTrack = async (req: Request, res: Response) => {
  const user = req.user as User;
  const track = await trackService.createTrack(user.id, req.body);
  return res.status(201).json(track);
};

export const updateTrack = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  const track = await trackService.updateTrack(user.id, id as string, req.body);
  return res.json(track);
};

export const deleteTrack = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await trackService.deleteTrack(user.id, id as string);
  return res.status(204).send();
};

export const recordPlay = async (req: Request, res: Response) => {
  const user = req.user as User | undefined;
  const { id } = req.params;
  const { durationPlayedSeconds } = req.body;

  await trackService.recordPlay(
    user?.id ?? null,
    id as string,
    durationPlayedSeconds,
  );
  return res.status(202).send();
};

export const likeTrack = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await trackService.likeTrack(user.id, id as string);
  return res.status(201).send();
};

export const unlikeTrack = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { id } = req.params;
  await trackService.unlikeTrack(user.id, id as string);
  return res.status(204).send();
};

export const generateUploadUrl = async (req: Request, res: Response) => {
  const user = req.user as User;
  const { artistId, fileName, contentType, fileSize } = req.body;

  const result = await trackService.generateAudioUploadUrl(
    user.id,
    artistId,
    fileName,
    contentType,
    fileSize,
  );

  return res.status(200).json(result);
};

export const handleTranscodeWebhook = async (req: Request, res: Response) => {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== env.AUD_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const { trackId, outboxId, status, audioUrl, error } = req.body;

  // Pass audioUrl along to the service handler
  await trackService.processTranscodeWebhook(
    trackId,
    outboxId,
    status,
    audioUrl,
    error,
  );

  return res.status(200).send('OK');
};

export const handleBatchPlaysWebhook = async (req: Request, res: Response) => {
  const secret = req.headers['x-webhook-secret'];
  if (!secret || secret !== env.AUD_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook' });
  }

  const { plays } = req.body;
  await trackService.processBatchPlays(plays);

  return res.status(200).send('OK');
};
