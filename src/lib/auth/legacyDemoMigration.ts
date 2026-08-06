'use client';

import { findLegacyDemoProfileByEmail } from '@/lib/demoAuth';
import { migrateLocalListingsFromLegacyOwner } from '@/lib/localListings';
import type { AppUser } from '@/lib/auth/types';

const LEGACY_DEMO_MIGRATION_STORAGE_KEY =
  'charlal:supabase-legacy-owner-migrations:v1';

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readCompletedMigrations(storage: Storage): string[] {
  const storedValue = storage.getItem(LEGACY_DEMO_MIGRATION_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeCompletedMigrations(storage: Storage, migrations: string[]): void {
  storage.setItem(
    LEGACY_DEMO_MIGRATION_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(migrations)))
  );
}

export function migrateLegacyDemoListingsForUser(user: AppUser): number {
  const storage = getBrowserStorage();

  if (!storage) {
    return 0;
  }

  const legacyProfile = findLegacyDemoProfileByEmail(user.email);

  if (!legacyProfile?.userId) {
    return 0;
  }

  const migrationKey = `${legacyProfile.userId}->${user.id}`;
  const completedMigrations = readCompletedMigrations(storage);

  if (completedMigrations.includes(migrationKey)) {
    return 0;
  }

  const migratedCount = migrateLocalListingsFromLegacyOwner({
    legacyOwnerId: legacyProfile.userId,
    newOwnerId: user.id,
    publicDisplayName: user.displayName,
  });

  writeCompletedMigrations(storage, [...completedMigrations, migrationKey]);

  return migratedCount;
}
