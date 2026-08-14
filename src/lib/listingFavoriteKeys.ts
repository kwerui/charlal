import type { Listing } from '@/data/listings';

export type ListingFavoriteSource = 'database' | 'builtin';

export type ListingFavoriteReference = {
  source: ListingFavoriteSource;
  listingId: string;
};

export type ListingFavoriteRecord = ListingFavoriteReference & {
  createdAt: string;
};

export function getListingFavoriteReference(
  listing: Listing
): ListingFavoriteReference | null {
  const listingId = String(listing.id).trim();

  if (!listingId || listingId.startsWith('local-')) {
    return null;
  }

  return {
    source: listingId.startsWith('db-') ? 'database' : 'builtin',
    listingId,
  };
}

export function getListingFavoriteKey(
  reference: ListingFavoriteReference
): string {
  return `${reference.source}:${reference.listingId}`;
}
