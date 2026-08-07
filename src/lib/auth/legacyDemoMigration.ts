'use client';

import { findLegacyDemoProfileByEmail } from '@/lib/demoAuth';
import {
  readLocalListings,
  removeLocalListingsById,
} from '@/lib/localListings';
import type { AppUser } from '@/lib/auth/types';
import { createDatabaseListingFromExistingListing } from '@/lib/supabase/listingsClient';

const LOCAL_LISTING_IMPORT_STORAGE_KEY =
  'charlal:supabase-listing-imports:v1';

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
  const storedValue = storage.getItem(LOCAL_LISTING_IMPORT_STORAGE_KEY);

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
    LOCAL_LISTING_IMPORT_STORAGE_KEY,
    JSON.stringify(Array.from(new Set(migrations)))
  );
}

function getImportKey(userId: string, listingId: string | number): string {
  return `${userId}:${String(listingId)}`;
}

export type LocalListingImportResult = {
  ok: boolean;
  importedCount: number;
};

export async function migrateLegacyDemoListingsForUser(
  user: AppUser
): Promise<LocalListingImportResult> {
  const storage = getBrowserStorage();

  if (!storage) {
    return { ok: true, importedCount: 0 };
  }

  const legacyProfile = findLegacyDemoProfileByEmail(user.email);
  const completedMigrations = readCompletedMigrations(storage);
  const eligibleOwnerIds = new Set<string>([user.id]);

  if (legacyProfile?.userId) {
    eligibleOwnerIds.add(legacyProfile.userId);
  }

  const localListingsToImport = readLocalListings().filter((listing) => {
    const ownerId = listing.ownerId?.trim();

    if (!ownerId || !eligibleOwnerIds.has(ownerId)) {
      return false;
    }

    return !completedMigrations.includes(getImportKey(user.id, listing.id));
  });

  if (localListingsToImport.length === 0) {
    return { ok: true, importedCount: 0 };
  }

  const importedListingIds: Array<string | number> = [];
  const completedImportKeys = [...completedMigrations];
  let failedCount = 0;

  for (const listing of localListingsToImport) {
    const importResult = await createDatabaseListingFromExistingListing({
      ...listing,
      ownerId: user.id,
      sellerName: user.displayName,
    });

    if (importResult.ok) {
      importedListingIds.push(listing.id);
      completedImportKeys.push(getImportKey(user.id, listing.id));
    } else {
      failedCount += 1;
    }
  }

  if (importedListingIds.length > 0) {
    removeLocalListingsById(importedListingIds);
    writeCompletedMigrations(storage, completedImportKeys);
  }

  return {
    ok: failedCount === 0,
    importedCount: importedListingIds.length,
  };
}
