import { connection } from 'next/server';
import type { Listing } from '@/data/listings';
import {
  isPublicDatabaseListingRowArray,
  publicDatabaseRowsToListings,
  type PublicDatabaseListingRow,
} from '@/lib/listingDatabaseTypes';
import { createClient } from '@/lib/supabase/server';
import {
  attachImageRowsToListings,
  listListingImageRowsForListingIds,
} from '@/lib/supabase/listingImages';

export type PublicSellerProfile = {
  publicSlug: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  memberSince: string;
};

type PublicSellerProfileRow = {
  public_slug: string;
  display_name: string;
  bio: string | null;
  location: string | null;
  member_since: string;
};

type PublicSellerPageResult =
  | {
      ok: true;
      profile: PublicSellerProfile | null;
      listings: Listing[];
    }
  | {
      ok: false;
      reason: 'database-unavailable';
    };

const PUBLIC_SELLER_SLUG_PATTERN = /^seller-[a-f0-9]{32}$/;

function isPublicSellerProfileRow(value: unknown): value is PublicSellerProfileRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Partial<Record<keyof PublicSellerProfileRow, unknown>>;

  return (
    typeof row.public_slug === 'string' &&
    typeof row.display_name === 'string' &&
    (row.bio === null || typeof row.bio === 'string') &&
    (row.location === null || typeof row.location === 'string') &&
    typeof row.member_since === 'string'
  );
}

function mapPublicSellerProfileRow(
  row: PublicSellerProfileRow
): PublicSellerProfile {
  return {
    publicSlug: row.public_slug,
    displayName: row.display_name,
    bio: row.bio,
    location: row.location,
    memberSince: row.member_since,
  };
}

export async function getPublicSellerPageBySlug(
  slug: string
): Promise<PublicSellerPageResult> {
  await connection();

  const safeSlug = slug.trim();

  if (!PUBLIC_SELLER_SLUG_PATTERN.test(safeSlug)) {
    return {
      ok: true,
      profile: null,
      listings: [],
    };
  }

  const supabase = await createClient();
  const [profileResult, listingsResult] = await Promise.all([
    supabase.rpc('get_public_seller_profile', {
      p_public_slug: safeSlug,
    }),
    supabase.rpc('list_public_seller_listings', {
      p_public_slug: safeSlug,
    }),
  ]);

  if (profileResult.error || listingsResult.error) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const profileRows = Array.isArray(profileResult.data)
    ? profileResult.data
    : [];
  const profileRow = profileRows[0];
  const listingRows = listingsResult.data as PublicDatabaseListingRow[] | null;

  if (!profileRow) {
    return {
      ok: true,
      profile: null,
      listings: [],
    };
  }

  if (
    !isPublicSellerProfileRow(profileRow) ||
    !isPublicDatabaseListingRowArray(listingRows)
  ) {
    return { ok: false, reason: 'database-unavailable' };
  }

  const listings = publicDatabaseRowsToListings(listingRows);
  const imageRows = await listListingImageRowsForListingIds(
    supabase,
    listings.map((listing) => String(listing.id))
  );

  return {
    ok: true,
    profile: mapPublicSellerProfileRow(profileRow),
    listings: attachImageRowsToListings(listings, imageRows),
  };
}
