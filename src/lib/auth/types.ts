export const PROFILE_DISPLAY_NAME_MAX_LENGTH = 80;
export const PROFILE_BIO_MAX_LENGTH = 500;
export const PROFILE_LOCATION_MAX_LENGTH = 100;
export const MINIMUM_PASSWORD_LENGTH = 8;

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
};

export type AppProfile = {
  id: string;
  displayName: string;
  publicSlug: string;
  bio: string | null;
  location: string | null;
  avatarPath: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
  createdAt: string;
  updatedAt: string;
};

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';
export type ProfileStatus = 'idle' | 'loading' | 'loaded' | 'error';

export function sanitizeProfileDisplayName(displayName: string): string {
  return displayName.trim().slice(0, PROFILE_DISPLAY_NAME_MAX_LENGTH);
}

export function sanitizeOptionalProfileText(
  value: string,
  maximumLength: number
): string | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.slice(0, maximumLength);
}

export function isEmailLikeDisplayName(displayName: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayName.trim());
}

export function isValidAuthEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function isValidProfileDisplayName(displayName: string): boolean {
  const safeDisplayName = sanitizeProfileDisplayName(displayName);

  return Boolean(safeDisplayName && !isEmailLikeDisplayName(safeDisplayName));
}
