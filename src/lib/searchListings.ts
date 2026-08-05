import type { Listing } from '@/data/listings';
import { filterListings } from '@/lib/listingFilters';

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function searchListings(allListings: Listing[], query: string): Listing[] {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return filterListings(allListings, { searchQuery: normalizedQuery });
}
