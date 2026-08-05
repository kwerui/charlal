import type { Listing } from '@/data/listings';

export type ListingFilterCriteria = {
  categorySlug?: string;
  subcategorySlug?: string;
  isAllPage?: boolean;
  housingTransaction?: string;
  housingPropertyType?: string;
  marketplaceType?: string;
  minPrice?: string;
  maxPrice?: string;
  searchQuery?: string;
};

export function filterListings(
  allListings: Listing[],
  criteria: ListingFilterCriteria
): Listing[] {
  const minPriceValue = Number(criteria.minPrice);
  const maxPriceValue = Number(criteria.maxPrice);
  const hasMinPrice = criteria.minPrice !== '' && Number.isFinite(minPriceValue);
  const hasMaxPrice = criteria.maxPrice !== '' && Number.isFinite(maxPriceValue);
  const normalizedSearchQuery = (criteria.searchQuery || '').trim().toLocaleLowerCase();
  const housingTransaction = criteria.housingTransaction || 'all';
  const housingPropertyType = criteria.housingPropertyType || 'all';

  return allListings.filter((listing) => {
    if (criteria.categorySlug && listing.categorySlug !== criteria.categorySlug) {
      return false;
    }

    if (criteria.categorySlug === 'housing') {
      if (housingTransaction !== 'all' && listing.transactionType !== housingTransaction) {
        return false;
      }

      if (housingPropertyType !== 'all' && listing.propertyType !== housingPropertyType) {
        return false;
      }
    } else if (
      criteria.subcategorySlug &&
      !criteria.isAllPage &&
      listing.subcategorySlug !== criteria.subcategorySlug
    ) {
      return false;
    }

    if (criteria.marketplaceType && listing.marketplaceType !== criteria.marketplaceType) {
      return false;
    }

    if (hasMinPrice && listing.price < minPriceValue) {
      return false;
    }

    if (hasMaxPrice && listing.price > maxPriceValue) {
      return false;
    }

    if (normalizedSearchQuery) {
      const searchableText = [
        listing.title,
        listing.description,
        listing.location,
        listing.sellerName,
      ]
        .join(' ')
        .toLocaleLowerCase();

      if (!searchableText.includes(normalizedSearchQuery)) {
        return false;
      }
    }

    return true;
  });
}
