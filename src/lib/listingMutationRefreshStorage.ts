'use client';

const LISTING_MUTATION_REFRESH_KEY = 'charlal-listing-mutation-refresh:v1';
const MAX_REFRESH_MARKER_AGE_MS = 5 * 60 * 1000;

type ListingMutationRefreshMarker = {
  listingId: string;
  savedAt: number;
  refreshedHrefs: string[];
};

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function readMarker(): ListingMutationRefreshMarker | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const storedValue = window.sessionStorage.getItem(
      LISTING_MUTATION_REFRESH_KEY
    );

    if (!storedValue) {
      return null;
    }

    const marker = JSON.parse(storedValue) as Partial<ListingMutationRefreshMarker>;

    if (
      typeof marker.listingId !== 'string' ||
      typeof marker.savedAt !== 'number' ||
      !Array.isArray(marker.refreshedHrefs)
    ) {
      window.sessionStorage.removeItem(LISTING_MUTATION_REFRESH_KEY);
      return null;
    }

    if (Date.now() - marker.savedAt > MAX_REFRESH_MARKER_AGE_MS) {
      window.sessionStorage.removeItem(LISTING_MUTATION_REFRESH_KEY);
      return null;
    }

    return {
      listingId: marker.listingId,
      savedAt: marker.savedAt,
      refreshedHrefs: marker.refreshedHrefs.filter(
        (href): href is string => typeof href === 'string'
      ),
    };
  } catch {
    window.sessionStorage.removeItem(LISTING_MUTATION_REFRESH_KEY);
    return null;
  }
}

function writeMarker(marker: ListingMutationRefreshMarker): void {
  window.sessionStorage.setItem(
    LISTING_MUTATION_REFRESH_KEY,
    JSON.stringify(marker)
  );
}

export function recordListingMutationRefreshIntent(listingId: string): void {
  if (!isBrowser()) {
    return;
  }

  const safeListingId = listingId.trim();

  if (!safeListingId) {
    return;
  }

  writeMarker({
    listingId: safeListingId,
    savedAt: Date.now(),
    refreshedHrefs: [],
  });
}

export function shouldRefreshForListingMutation(
  listingIds: string[],
  currentHref: string
): boolean {
  const marker = readMarker();

  if (!marker || !currentHref) {
    return false;
  }

  if (!listingIds.includes(marker.listingId)) {
    return false;
  }

  if (marker.refreshedHrefs.includes(currentHref)) {
    return false;
  }

  writeMarker({
    ...marker,
    refreshedHrefs: [...marker.refreshedHrefs, currentHref],
  });

  return true;
}
