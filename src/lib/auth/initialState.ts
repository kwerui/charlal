import type {
  AppProfile,
  AppUser,
  AuthStatus,
  ProfileStatus,
} from './types';

export type ResolvedAuthState = {
  status: AuthStatus;
  profileStatus: ProfileStatus;
  user: AppUser | null;
  profile: AppProfile | null;
};

export const unknownInitialAuthState: ResolvedAuthState = {
  status: 'checking',
  profileStatus: 'idle',
  user: null,
  profile: null,
};
