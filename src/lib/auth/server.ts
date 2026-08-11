import type { JwtPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { AppProfile, AppUser } from '@/lib/auth/types';

export type CurrentViewerIdResult =
  | {
      status: 'signed-in';
      userId: string;
    }
  | {
      status: 'signed-out';
    }
  | {
      status: 'unresolved';
    };

export type CurrentUserResult =
  | {
      status: 'authenticated';
      user: AppUser;
      profile: AppProfile;
    }
  | {
      status: 'signed-out';
    }
  | {
      status: 'profile-error';
    }
  | {
      status: 'unresolved';
    };

function isProfileRow(value: unknown): value is {
  id: string;
  display_name: string;
  public_slug: string;
  bio: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<{
    id: unknown;
    display_name: unknown;
    public_slug: unknown;
    bio: unknown;
    location: unknown;
    created_at: unknown;
    updated_at: unknown;
  }>;

  return (
    typeof profile.id === 'string' &&
    typeof profile.display_name === 'string' &&
    typeof profile.public_slug === 'string' &&
    (profile.bio === null || typeof profile.bio === 'string') &&
    (profile.location === null || typeof profile.location === 'string') &&
    typeof profile.created_at === 'string' &&
    typeof profile.updated_at === 'string'
  );
}

function getEmailFromClaims(claims: JwtPayload): string {
  return typeof claims.email === 'string' ? claims.email.trim() : '';
}

function isMissingAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const authError = error as {
    code?: unknown;
    message?: unknown;
    status?: unknown;
  };
  const code =
    typeof authError.code === 'string' ? authError.code.toLocaleLowerCase() : '';
  const message =
    typeof authError.message === 'string'
      ? authError.message.toLocaleLowerCase()
      : '';
  const status = typeof authError.status === 'number' ? authError.status : 0;

  return (
    status === 401 ||
    code.includes('session_not_found') ||
    code.includes('auth_session_missing') ||
    message.includes('auth session missing') ||
    message.includes('session missing')
  );
}

export async function getCurrentViewerId(): Promise<CurrentViewerIdResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (data?.claims?.sub) {
    return {
      status: 'signed-in',
      userId: data.claims.sub,
    };
  }

  if (!error || isMissingAuthSessionError(error)) {
    return { status: 'signed-out' };
  }

  return { status: 'unresolved' };
}

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const result = await getCurrentUserResult();

  return result.status === 'authenticated' ? result.profile : null;
}

export async function getCurrentUserResult(): Promise<CurrentUserResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (!claimsData?.claims?.sub) {
    if (!claimsError || isMissingAuthSessionError(claimsError)) {
      return { status: 'signed-out' };
    }

    return { status: 'unresolved' };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, public_slug, bio, location, created_at, updated_at')
    .eq('id', claimsData.claims.sub)
    .maybeSingle();

  if (error || !isProfileRow(data)) {
    return { status: 'profile-error' };
  }

  const profile = {
    id: data.id,
    displayName: data.display_name,
    publicSlug: data.public_slug,
    bio: data.bio,
    location: data.location,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
  const email = getEmailFromClaims(claimsData.claims);

  if (!email || profile.id !== claimsData.claims.sub) {
    return { status: 'profile-error' };
  }

  return {
    status: 'authenticated',
    profile,
    user: {
      id: claimsData.claims.sub,
      email,
      displayName: profile.displayName,
    },
  };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const result = await getCurrentUserResult();

  return result.status === 'authenticated' ? result.user : null;
}

export async function requireAuthenticatedUser(): Promise<AppUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Authenticated Supabase user is required.');
  }

  return user;
}
