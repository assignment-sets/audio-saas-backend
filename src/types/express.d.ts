import type { User, ArtistProfile, Subscription } from '@prisma/client';
import type { UserTier } from '../modules/users/user.service';

export type UserWithTier = User & {
  artistProfile: ArtistProfile | null;
  subscriptions: Subscription[];
  tier: UserTier;
};

declare global {
  namespace Express {
    interface Request {
      user?: UserWithTier; // This makes req.user available and typed everywhere
    }
  }
}
