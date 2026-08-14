import { connection } from 'next/server';
import { listings as builtInListings } from '@/data/listings';
import type { Listing } from '@/data/listings';
import { getCurrentViewerId } from '@/lib/auth/server';
import {
  getListingFavoriteKey,
  type ListingFavoriteRecord,
  type ListingFavoriteReference,
  type ListingFavoriteSource,
} from '@/lib/listingFavoriteKeys';
import { createClient } from '@/lib/supabase/server';
import { listPublicDatabaseListings } from '@/lib/supabase/listingsServer';

type ListingFavoriteRow = {
  listing_source: ListingFavoriteSource;
  listing_id: string;
  created_at: string;
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

type FavoriteDatabaseListingEligibilityRow = {
  id: string;
  owner_id: string;
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

function isFavoriteDatabaseListingEligibilityRow(
  value: unknown
): value is FavoriteDatabaseListingEligibilityRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<
    Record<keyof FavoriteDatabaseListingEligibilityRow, unknown>
  >;

  return typeof row.id === 'string' && typeof row.owner_id === 'string';
}

async function canSaveListingReference(
  reference: ListingFavoriteReference,
  userId: string
): Promise<boolean> {
  if (reference.source === 'builtin') {
    return builtInListings.some(
      (listing) => String(listing.id) === reference.listingId
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select('id, owner_id')
    .eq('id', reference.listingId)
    .in('status', ['active', 'reserved'])
    .maybeSingle();

  if (error || !isFavoriteDatabaseListingEligibilityRow(data)) {
    return false;
  }

  return data.owner_id !== userId;
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

  if (!(await canSaveListingReference(reference, viewer.userId))) {
    return { ok: false, reason: 'invalid-listing' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('listing_favorites').upsert(
    {
      user_id: viewer.userId,
      listing_source: reference.source,
      listing_id: reference.listingId,
    },
    {
      onConflict: 'user_id,listing_source,listing_id',
      ignoreDuplicates: true,
    }
  );

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true };
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

  const supabase = await createClient();
  const { error } = await supabase
    .from('listing_favorites')
    .delete()
    .eq('user_id', viewer.userId)
    .eq('listing_source', reference.source)
    .eq('listing_id', reference.listingId);

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return { ok: true };
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
  const databaseListingsResult = await listPublicDatabaseListings();

  if (!favoritesResult.ok || !databaseListingsResult.ok) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const favorites = favoritesResult.favorites;
  const listingByKey = new Map<string, Listing>();

  for (const listing of databaseListingsResult.listings) {
    listingByKey.set(
      getListingFavoriteKey({
        source: 'database',
        listingId: String(listing.id),
      }),
      listing
    );
  }

  for (const listing of builtInListings) {
    listingByKey.set(
      getListingFavoriteKey({
        source: 'builtin',
        listingId: String(listing.id),
      }),
      listing
    );
  }

  const visibleFavorites = favorites.filter((favorite) => {
    const listing = listingByKey.get(getListingFavoriteKey(favorite));

    return (
      listing &&
      !(
        favorite.source === 'database' &&
        listing.ownerId === viewer.userId
      )
    );
  });

  return {
    ok: true,
    favorites: visibleFavorites,
    savedKeys: visibleFavorites.map(getListingFavoriteKey),
    listings: visibleFavorites
      .map((favorite) => listingByKey.get(getListingFavoriteKey(favorite)))
      .filter((listing): listing is Listing => Boolean(listing)),
  };
}
