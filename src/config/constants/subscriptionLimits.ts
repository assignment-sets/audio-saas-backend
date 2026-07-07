import { UserTier } from '../../modules/users/user.service';

export interface TierLimits {
  maxPlaylists: number;
  maxTracksPerPlaylist: number;
  maxManagersPerArtist: number;
  allowPrivatePlaylists: boolean;
}

export const SUBSCRIPTION_LIMITS: Record<UserTier, TierLimits> = {
  [UserTier.FREE]: {
    maxPlaylists: 3,
    maxTracksPerPlaylist: 15,
    maxManagersPerArtist: 1,
    allowPrivatePlaylists: false,
  },
  [UserTier.LITE]: {
    maxPlaylists: 20,
    maxTracksPerPlaylist: 100,
    maxManagersPerArtist: 2,
    allowPrivatePlaylists: true,
  },
  [UserTier.PRO]: {
    maxPlaylists: Infinity,
    maxTracksPerPlaylist: Infinity,
    maxManagersPerArtist: 5,
    allowPrivatePlaylists: true,
  },
};
