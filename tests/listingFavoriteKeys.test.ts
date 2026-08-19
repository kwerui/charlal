import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getDatabaseListingIdsFromFavorites,
  type ListingFavoriteRecord,
} from '../src/lib/listingFavoriteKeys.js';

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
