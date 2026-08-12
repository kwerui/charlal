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

export type ListingPublicSellerProfile = {
  publicSlug: string;
  displayName: string;
  avatarPath: string | null;
  avatarFocusX: number;
  avatarFocusY: number;
  avatarZoom: number;
};

export type ListingPublicSellerProfileResult =
  | {
      ok: true;
      profile: ListingPublicSellerProfile | null;
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

type ListingPublicSellerProfileRow = {
  public_slug: string;
  display_name: string;
  avatar_path: string | null;
  avatar_focus_x: number;
  avatar_focus_y: number;
  avatar_zoom: number;
};

function isListingPublicSellerProfileRow(
  value: unknown
): value is ListingPublicSellerProfileRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof ListingPublicSellerProfileRow, unknown>>;

  return (
    typeof row.public_slug === 'string' &&
    typeof row.display_name === 'string' &&
    (row.avatar_path === null || typeof row.avatar_path === 'string') &&
    typeof row.avatar_focus_x === 'number' &&
    typeof row.avatar_focus_y === 'number' &&
    typeof row.avatar_zoom === 'number'
  );
}

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

export async function getPublicSellerProfileForListingId(
  listingId: string
): Promise<ListingPublicSellerProfileResult> {
  await connection();

  const safeListingId = listingId.trim();

  if (!safeListingId || /^\d+$/.test(safeListingId)) {
    return { ok: true, profile: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_listing_public_seller_profile', {
    p_listing_id: safeListingId,
  });

  if (error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const rows = Array.isArray(data) ? data : [];
  const row = rows[0];

  if (!row) {
    return { ok: true, profile: null };
  }

  if (!isListingPublicSellerProfileRow(row)) {
    return { ok: false, reason: 'database-unavailable' };
  }

  return {
    ok: true,
    profile: {
      publicSlug: row.public_slug,
      displayName: row.display_name,
      avatarPath: row.avatar_path,
      avatarFocusX: row.avatar_focus_x,
      avatarFocusY: row.avatar_focus_y,
      avatarZoom: row.avatar_zoom,
    },
  };
}
