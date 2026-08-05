import type { Listing } from '@/data/listings';
import type { DemoUser } from '@/lib/demoAuth';

export function normalizeOwnerId(email: string): string {
  return email.trim().toLocaleLowerCase();
}

export function getDemoUserOwnerId(user: DemoUser | null): string | undefined {
  const email = user?.email.trim();

  return email ? normalizeOwnerId(email) : undefined;
}

export function isListingOwnedByOwnerId(listing: Listing, ownerId: string): boolean {
  return listing.ownerId === ownerId;
}

export function isListingOwnedByUser(listing: Listing, user: DemoUser | null): boolean {
  const ownerId = getDemoUserOwnerId(user);

  return Boolean(ownerId && isListingOwnedByOwnerId(listing, ownerId));
}
