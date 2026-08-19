import { connection } from 'next/server';
import { listings as builtInListings } from '@/data/listings';
import type { Listing } from '@/data/listings';
import { getCurrentViewerId } from '@/lib/auth/server';
import {
  buildSavedListingsPayload,
  getDatabaseListingIdsFromFavorites,
  getListingFavoriteKey,
  type ListingFavoriteRecord,
  type ListingFavoriteReference,
  type ListingFavoriteSource,
} from '@/lib/listingFavoriteKeys';
import { createClient } from '@/lib/supabase/server';
import { listPublicDatabaseListingsByIds } from '@/lib/supabase/listingsServer';

type ListingFavoriteRow = {
  listing_source: ListingFavoriteSource;
  listing_id: string;
  created_at: string;
};

type SaveableListingRow = {
  id: string;
  owner_id: string;
  status: string;
};

export type ListingFavoriteMutationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: 'auth-required' | 'invalid-listing' | 'database-unavailable';
    };

export type SavedListingsResult =
  | {
      ok: true;
      listings: Listing[];
      favorites: ListingFavoriteRecord[];
      savedKeys: string[];
    }
  | {
      ok: false;
      reason: 'auth-required' | 'database-unavailable';
    };

type FavoriteReferencesResult =
  | {
      ok: true;
      favorites: ListingFavoriteRecord[];
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

export type CurrentUserFavoriteState = {
  userId: string | null;
  favorites: ListingFavoriteRecord[];
  savedKeys: string[];
};

function isListingFavoriteRow(value: unknown): value is ListingFavoriteRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof ListingFavoriteRow, unknown>>;

  return (
    (row.listing_source === 'database' || row.listing_source === 'builtin') &&
    typeof row.listing_id === 'string' &&
    typeof row.created_at === 'string'
  );
}

function isListingFavoriteRowArray(
  value: unknown
): value is ListingFavoriteRow[] {
  return Array.isArray(value) && value.every(isListingFavoriteRow);
}

function rowToFavorite(row: ListingFavoriteRow): ListingFavoriteRecord {
  return {
    source: row.listing_source,
    listingId: row.listing_id,
    createdAt: row.created_at,
  };
}

function isValidReference(reference: ListingFavoriteReference): boolean {
  return (
    (reference.source === 'database' || reference.source === 'builtin') &&
    reference.listingId.trim().length > 0
  );
}

function isSaveableListingRow(value: unknown): value is SaveableListingRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof SaveableListingRow, unknown>>;

  return (
    typeof row.id === 'string' &&
    typeof row.owner_id === 'string' &&
    typeof row.status === 'string'
  );
}

function isMissingRpcError(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

function logFavoriteMutationError(
  context: string,
  error: unknown
): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(`Favorite mutation failed during ${context}.`, error);
  }
}

async function canSaveListingReference(
  reference: ListingFavoriteReference,
  userId: string
): Promise<boolean> {
  const safeUserId = userId.trim();
  const safeListingId = reference.listingId.trim();

  if (!safeUserId || !safeListingId) {
    return false;
  }

  if (reference.source === 'builtin') {
    return builtInListings.some(
      (listing) => String(listing.id) === safeListingId
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('can_current_user_save_listing', {
    p_listing_id: safeListingId,
  });

  if (!error && typeof data === 'boolean') {
    return data === true;
  }

  if (error || typeof data !== 'boolean') {
    if (!isMissingRpcError(error)) {
      logFavoriteMutationError('listing save validation', error);
      return false;
    }

    const { data: listingData, error: listingError } = await supabase
      .from('listings')
      .select('id, owner_id, status')
      .eq('id', safeListingId)
      .in('status', ['active', 'reserved'])
      .maybeSingle();

    if (listingError) {
      logFavoriteMutationError('fallback listing save validation', listingError);
      return false;
    }

    if (!isSaveableListingRow(listingData)) {
      return false;
    }

    return listingData.owner_id !== safeUserId;
  }

  return false;
}

function normalizeFavoriteReference(
  reference: ListingFavoriteReference
): ListingFavoriteReference {
  return {
    source: reference.source,
    listingId: reference.listingId.trim(),
  };
}

async function upsertFavoriteReference(
  userId: string,
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('listing_favorites').upsert(
    {
      user_id: userId,
      listing_source: reference.source,
      listing_id: reference.listingId,
    },
    {
      onConflict: 'user_id,listing_source,listing_id',
      ignoreDuplicates: true,
    }
  );

  if (error) {
    logFavoriteMutationError('favorite upsert', error);
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true };
}

async function deleteFavoriteReference(
  userId: string,
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('listing_favorites')
    .delete()
    .eq('user_id', userId)
    .eq('listing_source', reference.source)
    .eq('listing_id', reference.listingId);

  if (error) {
    logFavoriteMutationError('favorite delete', error);
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true };
}

export async function saveListingFavoriteForSignedInUser(
  userId: string,
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const safeReference = normalizeFavoriteReference(reference);

  if (!isValidReference(safeReference)) {
    return { ok: false, reason: 'invalid-listing' };
  }

  if (!(await canSaveListingReference(safeReference, userId))) {
    return { ok: false, reason: 'invalid-listing' };
  }

  return upsertFavoriteReference(userId.trim(), safeReference);
}

export async function removeListingFavoriteForSignedInUser(
  userId: string,
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  const safeReference = normalizeFavoriteReference(reference);

  if (!isValidReference(safeReference)) {
    return { ok: false, reason: 'invalid-listing' };
  }

  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return deleteFavoriteReference(safeUserId, safeReference);
}

export async function getCurrentUserFavoriteReferences(): Promise<
  ListingFavoriteRecord[]
> {
  await connection();

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return [];
  }

  const result = await listFavoriteReferencesForSignedInUser(viewer.userId);

  return result.ok ? result.favorites : [];
}

export async function getCurrentUserFavoriteState(): Promise<CurrentUserFavoriteState> {
  await connection();

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return {
      userId: null,
      favorites: [],
      savedKeys: [],
    };
  }

  const result = await listFavoriteReferencesForSignedInUser(viewer.userId);
  const favorites = result.ok ? result.favorites : [];

  return {
    userId: viewer.userId,
    favorites,
    savedKeys: favorites.map(getListingFavoriteKey),
  };
}

async function listFavoriteReferencesForSignedInUser(
  userId: string
): Promise<FavoriteReferencesResult> {
  const safeUserId = userId.trim();

  if (!safeUserId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listing_favorites')
    .select('listing_source, listing_id, created_at')
    .eq('user_id', safeUserId)
    .order('created_at', { ascending: false });

  if (error || !isListingFavoriteRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    favorites: data.map(rowToFavorite),
  };
}

export async function saveListingFavorite(
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  await connection();

  if (!isValidReference(reference)) {
    return { ok: false, reason: 'invalid-listing' };
  }

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return { ok: false, reason: 'auth-required' };
  }

  return saveListingFavoriteForSignedInUser(viewer.userId, reference);
}

export async function removeListingFavorite(
  reference: ListingFavoriteReference
): Promise<ListingFavoriteMutationResult> {
  await connection();

  if (!isValidReference(reference)) {
    return { ok: false, reason: 'invalid-listing' };
  }

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return { ok: false, reason: 'auth-required' };
  }

  return removeListingFavoriteForSignedInUser(viewer.userId, reference);
}

export async function listCurrentUserSavedListings(): Promise<SavedListingsResult> {
  await connection();

  const viewer = await getCurrentViewerId();

  if (viewer.status !== 'signed-in') {
    return { ok: false, reason: 'auth-required' };
  }

  const favoritesResult = await listFavoriteReferencesForSignedInUser(
    viewer.userId
  );

  if (!favoritesResult.ok) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const favorites = favoritesResult.favorites;
  const databaseListingIds = getDatabaseListingIdsFromFavorites(favorites);
  const databaseListingsResult =
    databaseListingIds.length > 0
      ? await listPublicDatabaseListingsByIds(databaseListingIds)
      : { ok: true as const, listings: [] };

  if (!databaseListingsResult.ok) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return buildSavedListingsPayload(
    favorites,
    databaseListingsResult.listings,
    builtInListings
  );
}
