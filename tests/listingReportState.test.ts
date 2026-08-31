import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('listing detail hydrates already-reported state from the server', () => {
  const pageSource = readFileSync(
    'src/app/[locale]/listing/[id]/page.tsx',
    'utf8'
  );
  const detailSource = readFileSync(
    'src/app/components/ListingDetailView.tsx',
    'utf8'
  );
  const buttonSource = readFileSync(
    'src/app/components/ListingReportButton.tsx',
    'utf8'
  );

  assert.equal(
    pageSource.includes('getCurrentUserListingReportState(String(listing.id))'),
    true
  );
  assert.equal(
    pageSource.includes('initialAlreadyReported={reportState.alreadyReported}'),
    true
  );
  assert.equal(
    detailSource.includes('initialAlreadyReported={initialAlreadyReported}'),
    true
  );
  assert.equal(
    buttonSource.includes(
      'useState(initialAlreadyReported)'
    ),
    true
  );
  assert.equal(buttonSource.includes("setHasReported(true);"), true);
  assert.equal(buttonSource.includes('setReportStatus(result.status);'), true);
  assert.equal(buttonSource.includes("setReportStatus('idle');"), true);
  assert.equal(buttonSource.includes("setReportStatus('already-reported');"), true);
});

test('listing report state helper uses a narrow RPC instead of direct report reads', () => {
  const source = readFileSync('src/lib/supabase/listingReports.ts', 'utf8');

  assert.equal(source.includes("rpc('has_reported_listing'"), true);
  assert.equal(source.includes(".from('listing_reports')"), false);
  assert.equal(source.includes('getCurrentViewerId()'), true);
});
