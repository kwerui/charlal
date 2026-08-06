import type { Listing } from '@/data/listings';
import {
  getDemoUserDisplayName,
  type DemoUser,
} from '@/lib/demoAuth';

export function normalizeOwnerId(email: string): string {
  return email.trim().toLocaleLowerCase();
}

export function getDemoUserOwnerId(user: DemoUser | null): string | undefined {
  const userId = user?.userId.trim();

  return userId || undefined;
}

export function isListingOwnedByOwnerId(listing: Listing, ownerId: string): boolean {
  return listing.ownerId === ownerId;
}

export function isListingOwnedByUser(listing: Listing, user: DemoUser | null): boolean {
  const ownerId = getDemoUserOwnerId(user);

  return Boolean(ownerId && isListingOwnedByOwnerId(listing, ownerId));
}

export function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function getPublicSellerNameForListing(
  listing: Listing,
  currentUser: DemoUser | null,
  fallbackSellerName: string
): string {
  if (isListingOwnedByUser(listing, currentUser)) {
    const displayName = getDemoUserDisplayName(currentUser);

    if (displayName) {
      return displayName;
    }
  }

  if (!listing.sellerName || isEmailLike(listing.sellerName)) {
    return fallbackSellerName;
  }

  return listing.sellerName;
}
