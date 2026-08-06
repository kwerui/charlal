'use client';

import type { AuthError, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createClient } from '@/lib/supabase/client';
import { updateLocalListingSellerNamesForOwner } from '@/lib/localListings';
import { migrateLegacyDemoListingsForUser } from '@/lib/auth/legacyDemoMigration';
import {
  isValidProfileDisplayName,
  sanitizeProfileDisplayName,
  type AppProfile,
  type AppUser,
  type AuthStatus,
  type LegacyMigrationStatus,
  type ProfileStatus,
} from '@/lib/auth/types';

type AuthFailureReason =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'rate-limited'
  | 'network'
  | 'unknown';

type SignInResult =
  | { ok: true }
  | { ok: false; reason: AuthFailureReason };

type SignUpResult =
  | { ok: true; requiresEmailConfirmation: boolean }
  | { ok: false; reason: AuthFailureReason };

type ProfileUpdateResult =
  | { ok: true; user: AppUser }
  | { ok: false; reason: 'invalid-display-name' | 'unable-to-update' };

type AuthContextValue = {
  status: AuthStatus;
  profileStatus: ProfileStatus;
  legacyMigrationStatus: LegacyMigrationStatus;
  legacyMigrationCount: number | null;
  user: AppUser | null;
  profile: AppProfile | null;
  refreshAuth: () => Promise<void>;
  signOut: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<ProfileUpdateResult>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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

function mapProfile(profile: {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}): AppProfile {
  return {
    id: profile.id,
    displayName: profile.display_name,
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

function mapAppUser(user: User, profile: AppProfile): AppUser | null {
  const email = user.email?.trim();

  if (!email || user.id !== profile.id) {
    return null;
  }

  return {
    id: user.id,
    email,
    displayName: profile.displayName,
  };
}

function classifyAuthError(error: AuthError | Error | null): AuthFailureReason {
  if (!error) {
    return 'unknown';
  }

  const message = error.message.toLocaleLowerCase();
  const code = 'code' in error && typeof error.code === 'string'
    ? error.code.toLocaleLowerCase()
    : '';
  const status = 'status' in error && typeof error.status === 'number'
    ? error.status
    : undefined;

  if (
    code.includes('email_not_confirmed') ||
    message.includes('email not confirmed') ||
    message.includes('confirm')
  ) {
    return 'email-not-confirmed';
  }

  if (
    status === 429 ||
    code.includes('rate') ||
    message.includes('rate limit') ||
    message.includes('too many')
  ) {
    return 'rate-limited';
  }

  if (
    code.includes('invalid_credentials') ||
    message.includes('invalid login') ||
    message.includes('invalid credentials')
  ) {
    return 'invalid-credentials';
  }

  if (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('fetch')
  ) {
    return 'network';
  }

  return 'unknown';
}

async function loadProfile(userId: string): Promise<AppProfile | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !isProfileRow(data)) {
    return null;
  }

  return mapProfile(data);
}

async function resolveCurrentAuthState(): Promise<{
  status: AuthStatus;
  profileStatus: ProfileStatus;
  user: AppUser | null;
  profile: AppProfile | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return {
      status: 'unauthenticated',
      profileStatus: 'idle',
      user: null,
      profile: null,
    };
  }

  const profile = await loadProfile(data.user.id);
  const appUser = profile ? mapAppUser(data.user, profile) : null;

  if (!profile || !appUser) {
    return {
      status: 'authenticated',
      profileStatus: 'error',
      user: null,
      profile: null,
    };
  }

  return {
    status: 'authenticated',
    profileStatus: 'loaded',
    user: appUser,
    profile,
  };
}

async function runLegacyMigration(user: AppUser): Promise<number> {
  return migrateLegacyDemoListingsForUser(user);
}

export async function signInWithEmailPassword(
  email: string,
  password: string
): Promise<SignInResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { ok: false, reason: classifyAuthError(error) };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: classifyAuthError(error instanceof Error ? error : null),
    };
  }
}

export async function signUpWithEmailPassword({
  displayName,
  email,
  password,
  nextPath,
}: {
  displayName: string;
  email: string;
  password: string;
  nextPath: string;
}): Promise<SignUpResult> {
  try {
    const supabase = createClient();
    const origin = window.location.origin;
    const callbackUrl = new URL('/auth/callback', origin);

    callbackUrl.searchParams.set('next', nextPath);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
        },
        emailRedirectTo: callbackUrl.toString(),
      },
    });

    if (error) {
      return { ok: false, reason: classifyAuthError(error) };
    }

    return {
      ok: true,
      requiresEmailConfirmation: !data.session,
    };
  } catch (error) {
    return {
      ok: false,
      reason: classifyAuthError(error instanceof Error ? error : null),
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [legacyMigrationStatus, setLegacyMigrationStatus] =
    useState<LegacyMigrationStatus>('idle');
  const [legacyMigrationCount, setLegacyMigrationCount] = useState<number | null>(
    null
  );
  const [user, setUser] = useState<AppUser | null>(null);
  const [profile, setProfile] = useState<AppProfile | null>(null);

  const refreshAuth = useCallback(async () => {
    setStatus('checking');
    setProfileStatus('loading');
    setLegacyMigrationStatus('idle');
    setLegacyMigrationCount(null);

    const nextState = await resolveCurrentAuthState();

    setStatus(nextState.status);
    setProfileStatus(nextState.profileStatus);
    setUser(nextState.user);
    setProfile(nextState.profile);

    if (nextState.status !== 'authenticated' || !nextState.user) {
      setLegacyMigrationStatus('complete');
      setLegacyMigrationCount(null);
      return;
    }

    setLegacyMigrationStatus('running');

    try {
      const migratedCount = await runLegacyMigration(nextState.user);

      setLegacyMigrationCount(migratedCount);
    } catch {
      setLegacyMigrationCount(0);
    } finally {
      setLegacyMigrationStatus('complete');
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function refreshIfActive(): Promise<void> {
      if (!active) {
        return;
      }

      await refreshAuth();
    }

    void refreshIfActive();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => {
        void refreshIfActive();
      }, 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshAuth, supabase]);

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
    setStatus('unauthenticated');
    setProfileStatus('idle');
    setLegacyMigrationStatus('complete');
    setLegacyMigrationCount(null);
    setUser(null);
    setProfile(null);
  }

  async function updateDisplayName(
    displayName: string
  ): Promise<ProfileUpdateResult> {
    const safeDisplayName = sanitizeProfileDisplayName(displayName);

    if (!isValidProfileDisplayName(safeDisplayName) || !user) {
      return { ok: false, reason: 'invalid-display-name' };
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ display_name: safeDisplayName })
      .eq('id', user.id)
      .select('id, display_name, created_at, updated_at')
      .single();

    if (error || !isProfileRow(data)) {
      return { ok: false, reason: 'unable-to-update' };
    }

    const nextProfile = mapProfile(data);
    const nextUser = {
      ...user,
      displayName: nextProfile.displayName,
    };

    updateLocalListingSellerNamesForOwner(nextUser.id, nextUser.displayName);
    setProfile(nextProfile);
    setUser(nextUser);

    return { ok: true, user: nextUser };
  }

  const value: AuthContextValue = {
    status,
    profileStatus,
    legacyMigrationStatus,
    legacyMigrationCount,
    user,
    profile,
    refreshAuth,
    signOut,
    updateDisplayName,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthStatus(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuthStatus must be used within AuthProvider.');
  }

  return context;
}
