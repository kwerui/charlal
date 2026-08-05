import type { Listing } from '@/data/listings';

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

export function searchListings(allListings: Listing[], query: string): Listing[] {
  const normalizedQuery = normalizeSearchQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return allListings.filter((listing) => {
    const searchableText = [
      listing.title,
      listing.description,
      listing.location,
      listing.sellerName,
    ]
      .join(' ')
      .toLocaleLowerCase();

    return searchableText.includes(normalizedQuery);
  });
}
