const DEMO_AUTH_STORAGE_KEY = 'charlal-demo-auth-user';
const DEMO_DISPLAY_NAME_MAX_LENGTH = 60;

export type DemoUser = {
  email: string;
  userId: string;
  signedInAt: string;
  displayName?: string;
};

export type LegacyDemoUserProfile = {
  email: string;
  userId: string;
  displayName?: string;
};

type DemoAuthStorage = {
  activeUser: DemoUser | null;
  profiles: Record<string, LegacyDemoUserProfile>;
};

type NormalizedProfiles = {
  profiles: Record<string, LegacyDemoUserProfile>;
  changed: boolean;
};

export function normalizeDemoEmail(email: string): string {
  return email.trim().toLocaleLowerCase();
}

function createDemoUserId(): string {
  const randomId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `demo-user-${randomId}`;
}

function createEmptyAuthStorage(): DemoAuthStorage {
  return {
    activeUser: null,
    profiles: {},
  };
}

function isDemoUser(value: unknown): value is DemoUser {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Partial<DemoUser>;

  return (
    typeof user.email === 'string' &&
    typeof user.userId === 'string' &&
    user.userId.startsWith('demo-user-') &&
    typeof user.signedInAt === 'string' &&
    (user.displayName === undefined || typeof user.displayName === 'string')
  );
}

function isLegacyDemoUser(value: unknown): value is Omit<DemoUser, 'userId'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const user = value as Partial<DemoUser>;

  return (
    typeof user.email === 'string' &&
    typeof user.signedInAt === 'string' &&
    (user.displayName === undefined || typeof user.displayName === 'string')
  );
}

function normalizeStoredProfiles(value: unknown): NormalizedProfiles {
  if (!value || typeof value !== 'object') {
    return {
      profiles: {},
      changed: Boolean(value),
    };
  }

  const normalizedProfiles: Record<string, LegacyDemoUserProfile> = {};
  let changed = false;

  Object.entries(value as Record<string, unknown>).forEach(([storedKey, profileValue]) => {
    if (!profileValue || typeof profileValue !== 'object') {
      changed = true;
      return;
    }

    const profile = profileValue as Partial<LegacyDemoUserProfile>;

    if (typeof profile.email !== 'string' || !profile.email.trim()) {
      changed = true;
      return;
    }

    const emailKey = normalizeDemoEmail(profile.email);
    const userId =
      typeof profile.userId === 'string' && profile.userId.startsWith('demo-user-')
        ? profile.userId
        : createDemoUserId();
    const displayName =
      typeof profile.displayName === 'string' && profile.displayName.trim()
        ? sanitizeDemoDisplayName(profile.displayName)
        : '';

    normalizedProfiles[emailKey] = {
      email: profile.email.trim(),
      userId,
      ...(displayName ? { displayName } : {}),
    };

    if (
      storedKey !== emailKey ||
      profile.email !== profile.email.trim() ||
      profile.userId !== userId ||
      (profile.displayName?.trim() || '') !== displayName
    ) {
      changed = true;
    }
  });

  return {
    profiles: normalizedProfiles,
    changed,
  };
}

function readDemoAuthStorage(): DemoAuthStorage {
  if (typeof window === 'undefined') {
    return createEmptyAuthStorage();
  }

  const storedUser = window.localStorage.getItem(DEMO_AUTH_STORAGE_KEY);

  if (!storedUser) {
    return createEmptyAuthStorage();
  }

  try {
    const parsedUser: unknown = JSON.parse(storedUser);

    if (
      parsedUser &&
      typeof parsedUser === 'object' &&
      'profiles' in parsedUser &&
      'activeUser' in parsedUser
    ) {
      const storedAuth = parsedUser as {
        activeUser?: unknown;
        profiles?: unknown;
      };
      const normalizedProfiles = normalizeStoredProfiles(storedAuth.profiles);
      const activeUserValue: unknown = storedAuth.activeUser;
      let profiles = normalizedProfiles.profiles;
      let activeUser: DemoUser | null = null;
      let changed = normalizedProfiles.changed;

      if (isDemoUser(activeUserValue)) {
        const emailKey = normalizeDemoEmail(activeUserValue.email);
        const storedProfile = profiles[emailKey];
        const displayName =
          getDemoUserDisplayName(activeUserValue) ||
          storedProfile?.displayName ||
          '';

        activeUser = {
          ...activeUserValue,
          email: activeUserValue.email.trim(),
          ...(displayName ? { displayName } : {}),
        };
        profiles = {
          ...profiles,
          [emailKey]: {
            email: activeUser.email,
            userId: activeUser.userId,
            ...(displayName ? { displayName } : {}),
          },
        };
      } else if (isLegacyDemoUser(activeUserValue)) {
        const emailKey = normalizeDemoEmail(activeUserValue.email);
        const storedProfile = profiles[emailKey];
        const displayName =
          activeUserValue.displayName?.trim() ||
          storedProfile?.displayName ||
          '';
        const userId = storedProfile?.userId || createDemoUserId();

        activeUser = {
          email: activeUserValue.email.trim(),
          userId,
          signedInAt: activeUserValue.signedInAt,
          ...(displayName ? { displayName } : {}),
        };
        profiles = {
          ...profiles,
          [emailKey]: {
            email: activeUser.email,
            userId,
            ...(displayName ? { displayName } : {}),
          },
        };
        changed = true;
      } else if (activeUserValue !== null && activeUserValue !== undefined) {
        changed = true;
      }

      const nextStorage = {
        activeUser,
        profiles,
      };

      if (changed) {
        writeDemoAuthStorage(nextStorage);
      }

      return nextStorage;
    }

    if (isDemoUser(parsedUser)) {
      const emailKey = normalizeDemoEmail(parsedUser.email);
      const migratedStorage: DemoAuthStorage = {
        activeUser: parsedUser,
        profiles: {
          [emailKey]: {
            email: parsedUser.email,
            userId: parsedUser.userId,
            ...(parsedUser.displayName ? { displayName: parsedUser.displayName } : {}),
          },
        },
      };

      writeDemoAuthStorage(migratedStorage);

      return migratedStorage;
    }

    if (isLegacyDemoUser(parsedUser)) {
      const emailKey = normalizeDemoEmail(parsedUser.email);
      const upgradedUser: DemoUser = {
        ...parsedUser,
        userId: createDemoUserId(),
      };
      const migratedStorage: DemoAuthStorage = {
        activeUser: upgradedUser,
        profiles: {
          [emailKey]: {
            email: upgradedUser.email,
            userId: upgradedUser.userId,
            ...(upgradedUser.displayName ? { displayName: upgradedUser.displayName } : {}),
          },
        },
      };

      writeDemoAuthStorage(migratedStorage);

      return migratedStorage;
    }

    window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    return createEmptyAuthStorage();
  } catch {
    window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
    return createEmptyAuthStorage();
  }
}

function writeDemoAuthStorage(authStorage: DemoAuthStorage): void {
  window.localStorage.setItem(DEMO_AUTH_STORAGE_KEY, JSON.stringify(authStorage));
}

// TEMPORARY SUPABASE MIGRATION BRIDGE: this read-only helper exists only to
// recover old browser-local advertisement ownership after real auth sign-in.
export function findLegacyDemoProfileByEmail(
  email: string
): LegacyDemoUserProfile | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const emailKey = normalizeDemoEmail(email);
  const authStorage = readDemoAuthStorage();

  return authStorage.profiles[emailKey] || null;
}

function getDemoUserDisplayName(user: DemoUser | null): string {
  return user?.displayName?.trim() || '';
}

function sanitizeDemoDisplayName(displayName: string): string {
  return displayName.trim().slice(0, DEMO_DISPLAY_NAME_MAX_LENGTH);
}
