import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSavedListingsPayload,
  getDatabaseListingIdsFromFavorites,
  type ListingFavoriteRecord,
} from '../src/lib/listingFavoriteKeys.js';
import type { Listing } from '../src/data/listings.js';

function createListing(
  id: string | number,
  overrides: Partial<Listing> = {}
): Listing {
  return {
    id,
    title: `Listing ${id}`,
    description: `Description ${id}`,
    price: 100,
    location: 'Kyzyl',
    categorySlug: 'marketplace',
    subcategorySlug: 'buy',
    marketplaceType: 'used',
    image: 'https://example.com/listing.jpg',
    sellerName: 'Seller',
    datePosted: '2026-08-18',
    ...overrides,
  };
}

test('returns no database listing ids for empty favorites', () => {
  assert.deepEqual(getDatabaseListingIdsFromFavorites([]), []);
});

test('extracts unique database listing ids from favorites in saved order', () => {
  const favorites: ListingFavoriteRecord[] = [
    {
      source: 'builtin',
      listingId: '1',
      createdAt: '2026-08-18T12:00:00.000Z',
    },
    {
      source: 'database',
      listingId: ' db-listing-2 ',
      createdAt: '2026-08-18T11:00:00.000Z',
    },
    {
      source: 'database',
      listingId: 'db-listing-1',
      createdAt: '2026-08-18T10:00:00.000Z',
    },
    {
      source: 'database',
      listingId: 'db-listing-2',
      createdAt: '2026-08-18T09:00:00.000Z',
    },
  ];

  assert.deepEqual(getDatabaseListingIdsFromFavorites(favorites), [
    'db-listing-2',
    'db-listing-1',
  ]);
});

test('builds saved listings in favorite order and omits inaccessible listings', () => {
  const favorites: ListingFavoriteRecord[] = [
    {
      source: 'database',
      listingId: 'db-visible-2',
      createdAt: '2026-08-18T12:00:00.000Z',
    },
    {
      source: 'builtin',
      listingId: '7',
      createdAt: '2026-08-18T11:00:00.000Z',
    },
    {
      source: 'database',
      listingId: 'db-deleted',
      createdAt: '2026-08-18T10:00:00.000Z',
    },
    {
      source: 'database',
      listingId: 'db-owned',
      createdAt: '2026-08-18T09:00:00.000Z',
    },
    {
      source: 'database',
      listingId: 'db-visible-1',
      createdAt: '2026-08-18T08:00:00.000Z',
    },
  ];
  const databaseListings = [
    createListing('db-visible-1'),
    createListing('db-owned', { isOwnedByViewer: true }),
    createListing('db-visible-2'),
  ];
  const fallbackListings = [createListing(7)];

  const result = buildSavedListingsPayload(
    favorites,
    databaseListings,
    fallbackListings
  );

  assert.deepEqual(
    result.listings.map((listing) => String(listing.id)),
    ['db-visible-2', '7', 'db-visible-1']
  );
  assert.deepEqual(result.savedKeys, [
    'database:db-visible-2',
    'builtin:7',
    'database:db-visible-1',
  ]);
  assert.deepEqual(
    result.favorites.map((favorite) => favorite.listingId),
    ['db-visible-2', '7', 'db-visible-1']
  );
});
