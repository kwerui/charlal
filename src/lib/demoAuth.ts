export const DEMO_AUTH_STORAGE_KEY = 'charlal-demo-auth-user';
export const DEMO_AUTH_CHANGED_EVENT = 'charlal-demo-auth-changed';
export const DEMO_DISPLAY_NAME_MAX_LENGTH = 60;

export type DemoUser = {
  email: string;
  userId: string;
  signedInAt: string;
  displayName?: string;
};

type DemoUserProfile = {
  email: string;
  userId: string;
  displayName?: string;
};

type DemoAuthStorage = {
  activeUser: DemoUser | null;
  profiles: Record<string, DemoUserProfile>;
};

type NormalizedProfiles = {
  profiles: Record<string, DemoUserProfile>;
  changed: boolean;
};

function notifyDemoAuthChanged() {
  window.dispatchEvent(new Event(DEMO_AUTH_CHANGED_EVENT));
}

function normalizeDemoEmail(email: string): string {
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

  const normalizedProfiles: Record<string, DemoUserProfile> = {};
  let changed = false;

  Object.entries(value as Record<string, unknown>).forEach(([storedKey, profileValue]) => {
    if (!profileValue || typeof profileValue !== 'object') {
      changed = true;
      return;
    }

    const profile = profileValue as Partial<DemoUserProfile>;

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

export function subscribeToDemoAuth(listener: () => void) {
  window.addEventListener(DEMO_AUTH_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);

  return () => {
    window.removeEventListener(DEMO_AUTH_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function getDemoUser(): DemoUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return readDemoAuthStorage().activeUser;
}

export function getDemoUserDisplayName(user: DemoUser | null): string {
  return user?.displayName?.trim() || '';
}

export function sanitizeDemoDisplayName(displayName: string): string {
  return displayName.trim().slice(0, DEMO_DISPLAY_NAME_MAX_LENGTH);
}

export function isDemoSignedIn() {
  return getDemoUser() !== null;
}

export function getDemoAuthSnapshot() {
  return isDemoSignedIn();
}

export function getDemoAuthServerSnapshot() {
  return false;
}

// DEMO ONLY: this is not secure authentication and must not be used in production.
// It stores fake profile/auth data in localStorage so navigation can be tested.
// Anyone with access to this browser profile can inspect or modify localStorage.
// The opaque userId removes unnecessary email exposure but is not authorization.
export function demoSignIn(email: string, displayName?: string) {
  const normalizedEmail = normalizeDemoEmail(email);
  const authStorage = readDemoAuthStorage();
  const existingProfile = authStorage.profiles[normalizedEmail];
  const safeDisplayName = displayName ? sanitizeDemoDisplayName(displayName) : '';
  const existingDisplayName = existingProfile?.displayName || '';
  const userId = existingProfile?.userId || createDemoUserId();
  const demoUser: DemoUser = {
    email: email.trim(),
    userId,
    signedInAt: new Date().toISOString(),
    ...(safeDisplayName || existingDisplayName
      ? { displayName: safeDisplayName || existingDisplayName }
      : {}),
  };
  const nextProfiles = {
    ...authStorage.profiles,
    [normalizedEmail]: {
      email: demoUser.email,
      userId: demoUser.userId,
      ...(demoUser.displayName ? { displayName: demoUser.displayName } : {}),
    },
  };

  writeDemoAuthStorage({
    activeUser: demoUser,
    profiles: nextProfiles,
  });
  notifyDemoAuthChanged();
}

// DEMO ONLY: this public profile value lives only in localStorage. A real app
// needs a database-backed profile with server-side ownership rules.
export function updateDemoDisplayName(displayName: string): DemoUser | null {
  const currentUser = getDemoUser();
  const safeDisplayName = sanitizeDemoDisplayName(displayName);

  if (!currentUser || !safeDisplayName) {
    return null;
  }

  const authStorage = readDemoAuthStorage();
  const emailKey = normalizeDemoEmail(currentUser.email);
  const nextUser: DemoUser = {
    ...currentUser,
    displayName: safeDisplayName,
  };

  writeDemoAuthStorage({
    activeUser: nextUser,
    profiles: {
      ...authStorage.profiles,
      [emailKey]: {
        email: nextUser.email,
        userId: nextUser.userId,
        displayName: safeDisplayName,
      },
    },
  });
  notifyDemoAuthChanged();

  return nextUser;
}

// DEMO ONLY: this only removes the localStorage marker. A real app needs server auth.
export function demoSignOut() {
  const authStorage = readDemoAuthStorage();

  writeDemoAuthStorage({
    ...authStorage,
    activeUser: null,
  });
  notifyDemoAuthChanged();
}
