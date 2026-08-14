import type { Listing } from '@/data/listings';

type ListingPlaceholderData = Pick<
  Listing,
  'categorySlug' | 'subcategorySlug' | 'propertyType' | 'marketplaceType'
>;

const CATEGORY_PLACEHOLDERS: Record<string, string> = {
  housing: '/images/placeholders/housing.svg',
  marketplace: '/images/placeholders/marketplace.svg',
  auto: '/images/placeholders/auto.svg',
  jobs: '/images/placeholders/jobs.svg',
  services: '/images/placeholders/services.svg',
  events: '/images/placeholders/events.svg',
};

export function getListingPlaceholder(listingData: ListingPlaceholderData): string {
  return (
    CATEGORY_PLACEHOLDERS[listingData.categorySlug] ||
    '/images/placeholders/marketplace.svg'
  );
}

export function resolveListingImage(listing: Listing): string {
  const uploadedCoverImage = listing.images?.[0]?.url;

  if (uploadedCoverImage) {
    return uploadedCoverImage;
  }

  return listing.image || getListingPlaceholder(listing);
}
