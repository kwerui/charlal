import { content } from '@/content/tyv';

export type Listing = {
  id: number | string;
  title: string;
  description: string;
  price: number;
  location: string;
  categorySlug: string;
  subcategorySlug: string;
  image: string;
  sellerName: string;
  datePosted: string;
  updatedAt?: string;
  ownerId?: string;
  isOwnedByViewer?: boolean;
  viewerOwnershipUnavailable?: boolean;
  transactionType?: 'sale' | 'rent';
  propertyType?: 'apartments' | 'land' | 'commercial' | 'storage';
  marketplaceType?: string;
  images?: ListingImage[];
  status?: ListingStatus;
  moderationState?: ListingModerationState;
};

export type ListingImage = {
  id: string;
  url: string;
  position: number;
  storagePath?: string;
};

export type ListingStatus = 'active' | 'reserved' | 'sold' | 'archived';
export type ListingModerationState = 'normal' | 'hidden';

export const LISTING_STATUSES: ListingStatus[] = [
  'active',
  'reserved',
  'sold',
  'archived',
];

export function isListingStatus(value: unknown): value is ListingStatus {
  return (
    value === 'active' ||
    value === 'reserved' ||
    value === 'sold' ||
    value === 'archived'
  );
}

export function getListingStatus(listing: Listing): ListingStatus {
  return isListingStatus(listing.status) ? listing.status : 'active';
}

export function isListingModerationState(
  value: unknown
): value is ListingModerationState {
  return value === 'normal' || value === 'hidden';
}

export function getListingModerationState(
  listing: Listing
): ListingModerationState {
  return isListingModerationState(listing.moderationState)
    ? listing.moderationState
    : 'normal';
}

export const LOCAL_LISTING_PLACEHOLDER_IMAGE =
  'https://img.magnific.com/free-photo/hands-holding-colorful-paper-bags_1301-1750.jpg?semt=ais_hybrid&w=740&q=80';

export function formatListingPrice(price: number): string {
  if (price === 0) {
    return content.freePriceLabel;
  }

  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}
