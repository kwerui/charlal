import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSavedListingsPayload,
  canOfferListingFavoriteControl,
  getDatabaseListingIdsFromFavorites,
  getListingFavoriteReference,
  getRpcFavoriteSaveValidationResult,
  isKnownOwnDatabaseFavoriteListing,
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

test('returns database favorite references only for database listing ids', () => {
  assert.deepEqual(getListingFavoriteReference(createListing('db-abc')), {
    source: 'database',
    listingId: 'db-abc',
  });
  assert.equal(getListingFavoriteReference(createListing(42)), null);
  assert.equal(getListingFavoriteReference(createListing('local-draft')), null);
});

test('extracts unique database listing ids from favorites in saved order', () => {
  const favorites: ListingFavoriteRecord[] = [
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
  const result = buildSavedListingsPayload(favorites, databaseListings);

  assert.deepEqual(
    result.listings.map((listing) => String(listing.id)),
    ['db-visible-2', 'db-visible-1']
  );
  assert.deepEqual(result.savedKeys, [
    'database:db-visible-2',
    'database:db-visible-1',
  ]);
  assert.deepEqual(
    result.favorites.map((favorite) => favorite.listingId),
    ['db-visible-2', 'db-visible-1']
  );
});

test('does not offer a favorite save control for known own database listings', () => {
  const listing = createListing('db-owned', {
    isOwnedByViewer: true,
  });
  const reference = getListingFavoriteReference(listing);

  assert.equal(
    isKnownOwnDatabaseFavoriteListing(listing, reference, 'viewer-1'),
    true
  );
  assert.equal(
    canOfferListingFavoriteControl({
      listing,
      reference,
      isSaved: false,
      currentViewerId: 'viewer-1',
    }),
    false
  );
});

test('does not offer a favorite save control when the viewer owns the listing id', () => {
  const listing = createListing('db-owned-by-id', {
    ownerId: 'viewer-1',
  });
  const reference = getListingFavoriteReference(listing);

  assert.equal(
    isKnownOwnDatabaseFavoriteListing(listing, reference, 'viewer-1'),
    true
  );
  assert.equal(
    canOfferListingFavoriteControl({
      listing,
      reference,
      isSaved: false,
      currentViewerId: 'viewer-1',
    }),
    false
  );
});

test('hides new database saves when viewer ownership is unavailable', () => {
  const listing = createListing('db-unknown-owner', {
    viewerOwnershipUnavailable: true,
  });
  const reference = getListingFavoriteReference(listing);

  assert.equal(
    canOfferListingFavoriteControl({
      listing,
      reference,
      isSaved: false,
      currentViewerId: 'viewer-1',
    }),
    false
  );
  assert.equal(
    canOfferListingFavoriteControl({
      listing,
      reference,
      isSaved: true,
      currentViewerId: 'viewer-1',
    }),
    true
  );
});

test('allows known non-owned database favorite controls and rejects builtin controls', () => {
  const builtinListing = createListing(9);
  const databaseListing = createListing('db-visible');

  assert.equal(
    canOfferListingFavoriteControl({
      listing: builtinListing,
      reference: getListingFavoriteReference(builtinListing),
      isSaved: false,
      currentViewerId: 'viewer-1',
    }),
    false
  );
  assert.equal(
    canOfferListingFavoriteControl({
      listing: databaseListing,
      reference: getListingFavoriteReference(databaseListing),
      isSaved: false,
      currentViewerId: 'viewer-1',
    }),
    true
  );
});

test('maps favorite save-validation RPC outcomes to distinct reasons', () => {
  assert.deepEqual(getRpcFavoriteSaveValidationResult(true), { ok: true });
  assert.deepEqual(getRpcFavoriteSaveValidationResult(false), {
    ok: false,
    reason: 'invalid-listing',
  });
  assert.deepEqual(getRpcFavoriteSaveValidationResult(null, 'PGRST202'), {
    ok: false,
    reason: 'schema-unavailable',
  });
  assert.deepEqual(getRpcFavoriteSaveValidationResult(null, '42883'), {
    ok: false,
    reason: 'schema-unavailable',
  });
  assert.deepEqual(getRpcFavoriteSaveValidationResult(null, '42501'), {
    ok: false,
    reason: 'database-unavailable',
  });
});
