import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('seller public listings attach current-viewer ownership before card rendering', () => {
  const source = readFileSync(
    'src/lib/supabase/publicSellerProfilesServer.ts',
    'utf8'
  );

  assert.equal(
    source.includes("import { attachViewerOwnership } from '@/lib/supabase/listingViewerOwnership';"),
    true
  );
  assert.equal(
    source.includes('await attachViewerOwnership(\n    publicDatabaseRowsToListings(listingRows),\n    supabase\n  )'),
    true
  );
});

test('viewer ownership helper uses the current-user ownership RPC', () => {
  const source = readFileSync(
    'src/lib/supabase/listingViewerOwnership.ts',
    'utf8'
  );

  assert.equal(source.includes('list_current_user_owned_listing_ids'), true);
  assert.equal(source.includes('markListingOwnedByViewer(listing)'), true);
  assert.equal(source.includes('viewerOwnershipUnavailable: true'), true);
});
