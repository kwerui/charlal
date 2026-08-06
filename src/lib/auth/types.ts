export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
export const MINIMUM_PASSWORD_LENGTH = 8;

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AppProfile = {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';
export type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'error';
export type LegacyMigrationStatus = 'idle' | 'running' | 'complete';

export function sanitizeProfileDisplayName(displayName: string): string {
  return displayName.trim().slice(0, PROFILE_DISPLAY_NAME_MAX_LENGTH);
}

export function isEmailLikeDisplayName(displayName: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayName.trim());
}

export function isValidProfileDisplayName(displayName: string): boolean {
  const safeDisplayName = sanitizeProfileDisplayName(displayName);

  return Boolean(safeDisplayName && !isEmailLikeDisplayName(safeDisplayName));
}
