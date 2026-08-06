'use client';

import type { Listing } from '@/data/listings';
import { isListingOwnedByOwnerId } from '@/lib/listingOwnership';

export const LOCAL_LISTINGS_STORAGE_KEY = 'tuva-marketplace:user-listings:v1';
const LOCAL_LISTINGS_CHANGED_EVENT = 'tuva-marketplace:user-listings-changed';

type StorageListing = Listing & {
  id: string;
};

function getBrowserStorage(): Storage | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isLocalListing(value: unknown): value is StorageListing {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const listing = value as Partial<StorageListing>;

  return (
    typeof listing.id === 'string' &&
    listing.id.startsWith('local-') &&
    typeof listing.title === 'string' &&
    typeof listing.description === 'string' &&
    typeof listing.price === 'number' &&
    Number.isFinite(listing.price) &&
    typeof listing.location === 'string' &&
    typeof listing.categorySlug === 'string' &&
    typeof listing.subcategorySlug === 'string' &&
    typeof listing.image === 'string' &&
    typeof listing.sellerName === 'string' &&
    typeof listing.datePosted === 'string' &&
    (listing.updatedAt === undefined || typeof listing.updatedAt === 'string') &&
    (listing.ownerId === undefined || typeof listing.ownerId === 'string')
  );
}

function notifyLocalListingsChanged(): void {
  window.dispatchEvent(new Event(LOCAL_LISTINGS_CHANGED_EVENT));
}

export function subscribeToLocalListings(listener: () => void): () => void {
  window.addEventListener(LOCAL_LISTINGS_CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);

  return () => {
    window.removeEventListener(LOCAL_LISTINGS_CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function readLocalListings(): Listing[] {
  const storage = getBrowserStorage();

  if (!storage) {
    return [];
  }

  const storedListings = storage.getItem(LOCAL_LISTINGS_STORAGE_KEY);

  if (!storedListings) {
    return [];
  }

  try {
    const parsedListings: unknown = JSON.parse(storedListings);

    if (!Array.isArray(parsedListings)) {
      return [];
    }

    const seenIds = new Set<string>();
    const validListings: Listing[] = [];

    parsedListings.forEach((listing) => {
      if (isLocalListing(listing) && !seenIds.has(listing.id)) {
        seenIds.add(listing.id);
        validListings.push(listing);
      }
    });

    return validListings;
  } catch {
    return [];
  }
}

export function writeLocalListings(localListings: Listing[]): void {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  const seenIds = new Set<string>();
  const validListings = localListings.filter((listing): listing is StorageListing => {
    const validListing = isLocalListing(listing);
    const duplicate = validListing && seenIds.has(listing.id);

    if (validListing) {
      seenIds.add(listing.id);
    }

    return validListing && !duplicate;
  });

  storage.setItem(
    LOCAL_LISTINGS_STORAGE_KEY,
    JSON.stringify(validListings)
  );
  notifyLocalListingsChanged();
}

export function addLocalListing(listing: Listing): void {
  const currentListings = readLocalListings();
  writeLocalListings([
    listing,
    ...currentListings.filter((item) => item.id !== listing.id),
  ]);
}

export function findLocalListingById(id: string): Listing | undefined {
  return readLocalListings().find((listing) => listing.id === id);
}

export function getLocalListingsOwnedBy(ownerId: string): Listing[] {
  return readLocalListings().filter((listing) =>
    isListingOwnedByOwnerId(listing, ownerId)
  );
}

export function getUnassignedLocalListings(): Listing[] {
  return readLocalListings().filter((listing) => !listing.ownerId);
}

export function claimUnassignedLocalListingForOwner(
  listingId: string | number,
  ownerId: string
): boolean {
  const currentListings = readLocalListings();
  const listing = currentListings.find((item) => item.id === listingId);

  if (!listing || listing.ownerId) {
    return false;
  }

  writeLocalListings(
    currentListings.map((item) =>
      item.id === listingId ? { ...item, ownerId } : item
    )
  );

  return true;
}

export function updateLocalListingSellerNamesForOwner(
  ownerId: string,
  publicDisplayName: string
): number {
  const safeOwnerId = ownerId.trim();
  const safeDisplayName = publicDisplayName.trim();

  if (!safeOwnerId || !safeDisplayName) {
    return 0;
  }

  const currentListings = readLocalListings();
  let changedCount = 0;

  const nextListings = currentListings.map((listing) => {
    if (!isListingOwnedByOwnerId(listing, safeOwnerId)) {
      return listing;
    }

    if (listing.sellerName === safeDisplayName) {
      return listing;
    }

    changedCount += 1;

    return {
      ...listing,
      sellerName: safeDisplayName,
    };
  });

  if (changedCount > 0) {
    writeLocalListings(nextListings);
  }

  return changedCount;
}

type LocalListingUpdate = Pick<
  Listing,
  | 'title'
  | 'description'
  | 'price'
  | 'location'
  | 'categorySlug'
  | 'subcategorySlug'
  | 'image'
  | 'sellerName'
  | 'updatedAt'
> &
  Partial<
    Pick<
      Listing,
      'transactionType' | 'propertyType' | 'marketplaceType'
    >
  >;

export type UpdateLocalListingResult =
  | {
      ok: true;
      listing: Listing;
    }
  | {
      ok: false;
      reason: 'not-found' | 'not-owned';
    };

export function updateLocalListingOwnedBy(
  listingId: string | number,
  ownerId: string,
  updates: LocalListingUpdate
): UpdateLocalListingResult {
  const safeOwnerId = ownerId.trim();

  if (!safeOwnerId || typeof listingId !== 'string' || !listingId.startsWith('local-')) {
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  const currentListings = readLocalListings();
  const listing = currentListings.find((item) => item.id === listingId);

  if (!listing) {
    return {
      ok: false,
      reason: 'not-found',
    };
  }

  if (!isListingOwnedByOwnerId(listing, safeOwnerId)) {
    return {
      ok: false,
      reason: 'not-owned',
    };
  }

  const updatedListing: Listing = {
    ...listing,
    title: updates.title,
    description: updates.description,
    price: updates.price,
    location: updates.location,
    categorySlug: updates.categorySlug,
    subcategorySlug: updates.subcategorySlug,
    image: updates.image,
    sellerName: updates.sellerName,
    updatedAt: updates.updatedAt,
  };

  if (updates.transactionType) {
    updatedListing.transactionType = updates.transactionType;
  } else {
    delete updatedListing.transactionType;
  }

  if (updates.propertyType) {
    updatedListing.propertyType = updates.propertyType;
  } else {
    delete updatedListing.propertyType;
  }

  if (updates.marketplaceType) {
    updatedListing.marketplaceType = updates.marketplaceType;
  } else {
    delete updatedListing.marketplaceType;
  }

  writeLocalListings(
    currentListings.map((item) =>
      item.id === listingId ? updatedListing : item
    )
  );

  return {
    ok: true,
    listing: updatedListing,
  };
}

export function migrateLocalListingOwnerId(
  legacyOwnerId: string,
  stableOwnerId: string
): number {
  const safeLegacyOwnerId = legacyOwnerId.trim().toLocaleLowerCase();
  const safeStableOwnerId = stableOwnerId.trim();

  if (!safeLegacyOwnerId || !safeStableOwnerId || safeLegacyOwnerId === safeStableOwnerId) {
    return 0;
  }

  const currentListings = readLocalListings();
  let changedCount = 0;

  const nextListings = currentListings.map((listing) => {
    const storedOwnerId = listing.ownerId?.trim().toLocaleLowerCase();

    if (storedOwnerId !== safeLegacyOwnerId) {
      return listing;
    }

    changedCount += 1;

    return {
      ...listing,
      ownerId: safeStableOwnerId,
    };
  });

  if (changedCount > 0) {
    writeLocalListings(nextListings);
  }

  return changedCount;
}

export function deleteLocalListingOwnedBy(
  listingId: string | number,
  ownerId: string
): boolean {
  const currentListings = readLocalListings();
  const listing = currentListings.find((item) => item.id === listingId);

  if (!listing || !isListingOwnedByOwnerId(listing, ownerId)) {
    return false;
  }

  writeLocalListings(currentListings.filter((item) => item.id !== listingId));

  return true;
}

export function combineListings(
  builtInListings: Listing[],
  localListings: Listing[]
): Listing[] {
  const builtInIds = new Set(builtInListings.map((listing) => String(listing.id)));
  const safeLocalListings = localListings.filter(
    (listing) => !builtInIds.has(String(listing.id))
  );

  return [...safeLocalListings, ...builtInListings];
}

export function createLocalListingId(existingIds: Iterable<string | number>): string {
  const usedIds = new Set(Array.from(existingIds, (id) => String(id)));

  for (let index = 0; index < 10; index += 1) {
    const randomId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const listingId = `local-${randomId}`;

    if (!usedIds.has(listingId)) {
      return listingId;
    }
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function clearLocalListings(): void {
  const storage = getBrowserStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(LOCAL_LISTINGS_STORAGE_KEY);
  notifyLocalListingsChanged();
}
