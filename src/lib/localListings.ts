'use client';

import type { Listing } from '@/data/listings';

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
    typeof listing.datePosted === 'string'
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
