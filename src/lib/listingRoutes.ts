import type { Listing } from '@/data/listings';

export function getListingFallbackResultsHref(listing: Listing): string {
  if (listing.categorySlug === 'housing' && listing.propertyType) {
    return `/category/housing/${listing.subcategorySlug}?propertyType=${listing.propertyType}`;
  }

  return `/category/${listing.categorySlug}/${listing.subcategorySlug}`;
}
