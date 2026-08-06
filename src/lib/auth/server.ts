import type { JwtPayload } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { AppProfile, AppUser } from '@/lib/auth/types';

function isProfileRow(value: unknown): value is {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
} {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const profile = value as Partial<{
    id: unknown;
    display_name: unknown;
    created_at: unknown;
    updated_at: unknown;
  }>;

  return (
    typeof profile.id === 'string' &&
    typeof profile.display_name === 'string' &&
    typeof profile.created_at === 'string' &&
    typeof profile.updated_at === 'string'
  );
}

function getEmailFromClaims(claims: JwtPayload): string {
  return typeof claims.email === 'string' ? claims.email.trim() : '';
}

export async function getCurrentProfile(): Promise<AppProfile | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    return null;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at, updated_at')
    .eq('id', claimsData.claims.sub)
    .maybeSingle();

  if (error || !isProfileRow(data)) {
    return null;
  }

  return {
    id: data.id,
    displayName: data.display_name,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  const profile = await getCurrentProfile();
  const email = getEmailFromClaims(data.claims);

  if (!profile || !email || profile.id !== data.claims.sub) {
    return null;
  }

  return {
    id: data.claims.sub,
    email,
    displayName: profile.displayName,
  };
}

export async function requireAuthenticatedUser(): Promise<AppUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error('Authenticated Supabase user is required.');
  }

  return user;
}
