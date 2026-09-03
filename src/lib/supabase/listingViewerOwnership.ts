import type { Listing } from '@/data/listings';
import type { createClient } from '@/lib/supabase/server';
import { markListingOwnedByViewer } from '../listingDatabaseTypes';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type OwnedListingIdRow = {
  listing_id: string;
};

function isOwnedListingIdRow(value: unknown): value is OwnedListingIdRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof OwnedListingIdRow, unknown>>;

  return typeof row.listing_id === 'string';
}

function isOwnedListingIdRowArray(value: unknown): value is OwnedListingIdRow[] {
  return Array.isArray(value) && value.every(isOwnedListingIdRow);
}

function markViewerOwnershipUnavailable(listings: Listing[]): Listing[] {
  return listings.map((listing) => ({
    ...listing,
    viewerOwnershipUnavailable: true,
  }));
}

export async function attachViewerOwnership(
  listings: Listing[],
  supabase: SupabaseServerClient
): Promise<Listing[]> {
  if (listings.length === 0) {
    return listings;
  }

  const { data: claimsData } = await supabase.auth.getClaims();
  const viewerId = claimsData?.claims?.sub;

  if (!viewerId) {
    return listings;
  }

  const listingIds = listings.map((listing) => String(listing.id));
  const { data, error } = await supabase.rpc('list_current_user_owned_listing_ids', {
    p_listing_ids: listingIds,
  });

  if (error || !isOwnedListingIdRowArray(data)) {
    return markViewerOwnershipUnavailable(listings);
  }

  const ownedIds = new Set(data.map((row) => row.listing_id));

  return listings.map((listing) =>
    ownedIds.has(String(listing.id)) ? markListingOwnedByViewer(listing) : listing
  );
}
