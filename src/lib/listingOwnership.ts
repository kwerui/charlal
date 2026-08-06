import type { Listing } from '@/data/listings';
import type { AppUser } from '@/lib/auth/types';

export function normalizeOwnerId(email: string): string {
  return email.trim().toLocaleLowerCase();
}

export function getUserOwnerId(user: AppUser | null): string | undefined {
  const userId = user?.id.trim();

  return userId || undefined;
}

export function isListingOwnedByOwnerId(listing: Listing, ownerId: string): boolean {
  return listing.ownerId === ownerId;
}

export function isListingOwnedByUser(listing: Listing, user: AppUser | null): boolean {
  const ownerId = getUserOwnerId(user);

  return Boolean(ownerId && isListingOwnedByOwnerId(listing, ownerId));
}

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function getPublicSellerNameForListing(
  listing: Listing,
  currentUser: AppUser | null,
  fallbackSellerName: string
): string {
  if (isListingOwnedByUser(listing, currentUser)) {
    const displayName = currentUser?.displayName.trim();

    if (displayName) {
      return displayName;
    }
  }

  if (!listing.sellerName || isEmailLike(listing.sellerName)) {
    return fallbackSellerName;
  }

  return listing.sellerName;
}
