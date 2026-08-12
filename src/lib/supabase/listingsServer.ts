import { connection } from 'next/server';
import type { Listing } from '@/data/listings';
import {
  DATABASE_LISTING_SELECT_COLUMNS,
  databaseRowToListing,
  databaseRowsToListings,
  isDatabaseListingRow,
  isDatabaseListingRowArray,
} from '@/lib/listingDatabaseTypes';
import {
  attachImageRowsToListings,
  listListingImageRowsForListingIds,
} from '@/lib/supabase/listingImages';
import { createClient } from '@/lib/supabase/server';

export type DatabaseListingReadResult =
  | {
      ok: true;
      listings: Listing[];
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

export type DatabaseListingDetailResult =
  | {
      ok: true;
      listing: Listing | null;
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

export type PublicSellerSlugResult =
  | {
      ok: true;
      publicSlug: string | null;
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

export async function listPublicDatabaseListings(): Promise<DatabaseListingReadResult> {
  await connection();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .in('status', ['active', 'reserved'])
    .order('created_at', { ascending: false });

  if (error || !isDatabaseListingRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listings = databaseRowsToListings(data);
  const imageRows = await listListingImageRowsForListingIds(
    supabase,
    listings.map((listing) => String(listing.id))
  );

  return {
    ok: true,
    listings: attachImageRowsToListings(listings, imageRows),
  };
}

export async function listOwnedDatabaseListingsForOwner(
  ownerId: string
): Promise<DatabaseListingReadResult> {
  await connection();

  const safeOwnerId = ownerId.trim();

  if (!safeOwnerId) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .eq('owner_id', safeOwnerId)
    .order('created_at', { ascending: false });

  if (error || !isDatabaseListingRowArray(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listings = databaseRowsToListings(data);
  const imageRows = await listListingImageRowsForListingIds(
    supabase,
    listings.map((listing) => String(listing.id))
  );

  return {
    ok: true,
    listings: attachImageRowsToListings(listings, imageRows),
  };
}

export async function getPublicDatabaseListingById(
  id: string
): Promise<DatabaseListingDetailResult> {
  await connection();

  const safeId = id.trim();

  if (!safeId || /^\d+$/.test(safeId)) {
    return { ok: true, listing: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(DATABASE_LISTING_SELECT_COLUMNS)
    .eq('id', safeId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  if (!data) {
    return { ok: true, listing: null };
  }

  if (!isDatabaseListingRow(data)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listing = databaseRowToListing(data);
  const imageRows = await listListingImageRowsForListingIds(supabase, [
    String(listing.id),
  ]);

  return {
    ok: true,
    listing: attachImageRowsToListings([listing], imageRows)[0] || listing,
  };
}

export async function getPublicSellerSlugForListingId(
  listingId: string
): Promise<PublicSellerSlugResult> {
  await connection();

  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { ok: true, publicSlug: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_listing_public_seller_slug', {
    p_listing_id: safeListingId,
  });

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    publicSlug: typeof data === 'string' ? data : null,
  };
}
