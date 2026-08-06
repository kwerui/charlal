import type { Listing } from '@/data/listings';

export const OLD_GENERIC_LOCAL_PLACEHOLDER_IMAGE =
  'https://img.magnific.com/free-photo/hands-holding-colorful-paper-bags_1301-1750.jpg?semt=ais_hybrid&w=740&q=80';

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
  const isLocalListing = typeof listing.id === 'string' && listing.id.startsWith('local-');

  if (
    isLocalListing &&
    (!listing.image || listing.image === OLD_GENERIC_LOCAL_PLACEHOLDER_IMAGE)
  ) {
    return getListingPlaceholder(listing);
  }

  return listing.image || getListingPlaceholder(listing);
}
