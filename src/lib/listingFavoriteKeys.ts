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

export function getDatabaseListingIdsFromFavorites(
  favorites: ListingFavoriteReference[]
): string[] {
  const listingIds: string[] = [];
  const seenListingIds = new Set<string>();

  for (const favorite of favorites) {
    const listingId = favorite.listingId.trim();

    if (
      favorite.source !== 'database' ||
      !listingId ||
      seenListingIds.has(listingId)
    ) {
      continue;
    }

    listingIds.push(listingId);
    seenListingIds.add(listingId);
  }

  return listingIds;
}

export type SavedListingsPayload = {
  ok: true;
  listings: Listing[];
  favorites: ListingFavoriteRecord[];
  savedKeys: string[];
};

export function buildSavedListingsPayload(
  favorites: ListingFavoriteRecord[],
  databaseListings: Listing[],
  fallbackListings: Listing[]
): SavedListingsPayload {
  const listingByKey = new Map<string, Listing>();

  for (const listing of databaseListings) {
    listingByKey.set(
      getListingFavoriteKey({
        source: 'database',
        listingId: String(listing.id),
      }),
      listing
    );
  }

  for (const listing of fallbackListings) {
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
        listing.isOwnedByViewer === true
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
