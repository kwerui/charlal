import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasPublicListingSearchQuery,
  normalizePublicListingQueryOptions,
  toPublicListingIlikePattern,
} from '../src/lib/publicListingQuery.js';

test('normalizes listing query options for bounded category queries', () => {
  assert.deepEqual(
    normalizePublicListingQueryOptions({
      categorySlug: ' marketplace ',
      subcategorySlug: ' buy ',
      minPrice: '1000',
      maxPrice: '5000',
      marketplaceType: ' used ',
      searchQuery: ' phone ',
      limit: 12,
    }),
    {
      categorySlug: 'marketplace',
      subcategorySlug: 'buy',
      isAllPage: false,
      housingTransaction: 'all',
      housingPropertyType: 'all',
      marketplaceType: 'used',
      minPrice: 1000,
      maxPrice: 5000,
      searchQuery: 'phone',
      limit: 12,
    }
  );
});

test('ignores subcategory filtering for all category pages', () => {
  assert.equal(
    normalizePublicListingQueryOptions({
      categorySlug: 'auto',
      subcategorySlug: 'all',
      isAllPage: true,
    }).subcategorySlug,
    ''
  );
});

test('clamps invalid or oversized limits', () => {
  assert.equal(normalizePublicListingQueryOptions({ limit: -1 }).limit, undefined);
  assert.equal(normalizePublicListingQueryOptions({ limit: 500 }).limit, 100);
});

test('detects only meaningful search queries', () => {
  assert.equal(hasPublicListingSearchQuery({ searchQuery: '   ' }), false);
  assert.equal(hasPublicListingSearchQuery({ searchQuery: 'bike' }), true);
}
);

test('escapes user search text for PostgREST ilike filters', () => {
  assert.equal(
    toPublicListingIlikePattern('  50% off_(today), please  '),
    '%50\\% off\\_ today please%'
  );
});
