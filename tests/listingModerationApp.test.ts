import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('public listing server reads explicitly filter out moderation-hidden listings', () => {
  const source = readFileSync('src/lib/supabase/listingsServer.ts', 'utf8');
  const serverClientSource = readFileSync('src/lib/supabase/server.ts', 'utf8');
  const listFunction = source.slice(
    source.indexOf('export async function listPublicDatabaseListings'),
    source.indexOf('export async function listPublicDatabaseListingsByIds')
  );
  const listByIdsFunction = source.slice(
    source.indexOf('export async function listPublicDatabaseListingsByIds'),
    source.indexOf('export async function listOwnedDatabaseListingsForOwner')
  );
  const detailFunction = source.slice(
    source.indexOf('export async function getPublicDatabaseListingById'),
    source.indexOf('export async function getOwnedDatabaseListingById')
  );

  assert.equal(serverClientSource.includes('createPublicClient'), true);
  assert.match(serverClientSource, /getAll\(\)\s*{\s*return \[\];\s*}/);
  assert.equal(source.includes('createPublicClient'), true);
  assert.equal(listFunction.includes('const publicSupabase = await createPublicClient();'), true);
  assert.equal(listByIdsFunction.includes('const publicSupabase = await createPublicClient();'), true);
  assert.equal(detailFunction.includes('const publicSupabase = await createPublicClient();'), true);
  assert.equal(
    source.includes(".eq('moderation_state', 'normal')"),
    true
  );
  assert.equal(
    source.includes(".in('status', ['active', 'reserved'])"),
    true
  );
  assert.equal(
    detailFunction.includes(".in('status', ['active', 'reserved'])"),
    true
  );
  assert.equal(
    detailFunction.includes(".rpc('listing_is_publicly_visible'"),
    false
  );
  assert.equal(
    listFunction.includes(".rpc('listing_is_publicly_visible'"),
    false
  );
  assert.equal(
    listByIdsFunction.includes(".rpc('listing_is_publicly_visible'"),
    false
  );
  assert.equal(
    detailFunction.includes('getSafeResultsHref'),
    false
  );
  assert.equal(
    source.includes("listPublicDatabaseListings("),
    true
  );
  assert.equal(
    source.includes("listPublicDatabaseListingsByIds("),
    true
  );
  assert.equal(
    source.includes("getPublicDatabaseListingById("),
    true
  );
});

test('owner account listings surface moderation-hidden listings without public detail routing', () => {
  const accountSource = readFileSync(
    'src/app/[locale]/account/AccountDashboard.tsx',
    'utf8'
  );
  const accountPageSource = readFileSync(
    'src/app/[locale]/account/page.tsx',
    'utf8'
  );
  const cardSource = readFileSync('src/app/components/ListingCard.tsx', 'utf8');

  assert.equal(accountSource.includes('getListingModerationState(listing)'), true);
  assert.equal(
    accountSource.includes("getListingModerationState(listing) === 'hidden'"),
    true
  );
  assert.equal(accountSource.includes("t('moderationHiddenBadge')"), true);
  assert.equal(accountSource.includes("t('moderationHiddenMessage')"), true);
  assert.equal(accountSource.includes('showActiveStatus={!isModerationHidden}'), true);
  assert.equal(
    accountSource.includes("const editHref = `/account/listings/${listing.id}/edit`;"),
    true
  );
  assert.equal(
    accountSource.includes('listingHref={isModerationHidden ? editHref : undefined}'),
    true
  );
  assert.equal(cardSource.includes('listingHref?: string;'), true);
  assert.equal(accountPageSource.includes('getCurrentUserIsAdmin()'), true);
  assert.equal(accountPageSource.includes('initialIsAdmin={isAdmin}'), true);
  assert.equal(accountSource.includes('initialIsAdmin: boolean;'), true);
  assert.equal(accountSource.includes('initialIsAdmin ? ('), true);
  assert.equal(accountSource.includes('href="/admin/reports"'), true);
  assert.equal(accountSource.includes("t('adminReportsLabel')"), true);
});

test('public entry points keep public eligibility separate from owner history reads', () => {
  const accountPageSource = readFileSync(
    'src/app/[locale]/account/page.tsx',
    'utf8'
  );
  const listingPageSource = readFileSync(
    'src/app/[locale]/listing/[id]/page.tsx',
    'utf8'
  );
  const contactPageSource = readFileSync(
    'src/app/[locale]/contact/[listingId]/page.tsx',
    'utf8'
  );
  const favoritesSource = readFileSync(
    'src/lib/supabase/listingFavorites.ts',
    'utf8'
  );
  const listingsServerSource = readFileSync(
    'src/lib/supabase/listingsServer.ts',
    'utf8'
  );

  assert.equal(accountPageSource.includes('listOwnedDatabaseListingsForOwner'), true);
  assert.equal(listingsServerSource.includes("rpc('list_my_listings'"), true);
  assert.equal(listingPageSource.includes('getPublicDatabaseListingById(id)'), true);
  assert.equal(
    listingPageSource.includes('getPublicDatabaseListingById(id, query'),
    false
  );
  assert.equal(
    listingPageSource.includes('getPublicDatabaseListingById(id, safeFromHref'),
    false
  );
  assert.equal(
    contactPageSource.includes('getPublicDatabaseListingById(listingId)'),
    true
  );
  assert.equal(
    favoritesSource.includes('listPublicDatabaseListingsByIds(databaseListingIds)'),
    true
  );
});

test('admin reports page is server protected and uses only admin moderation RPC wrappers', () => {
  const pageSource = readFileSync(
    'src/app/[locale]/admin/reports/page.tsx',
    'utf8'
  );
  const actionSource = readFileSync('src/app/admin/reports/actions.ts', 'utf8');
  const adminSource = readFileSync('src/lib/supabase/adminModeration.ts', 'utf8');

  assert.equal(pageSource.includes('getCurrentUserIsAdmin()'), true);
  assert.equal(pageSource.includes('notFound();'), true);
  assert.equal(pageSource.includes('listAdminListingReports'), true);
  assert.equal(pageSource.includes("getTranslations('AdminReports')"), true);
  assert.equal(pageSource.includes('formatAppShortDate'), true);
  assert.equal(pageSource.includes('formatAppTime'), true);
  assert.equal(pageSource.includes("new Intl.DateTimeFormat('en'"), false);
  assert.equal(actionSource.includes("'use server';"), true);
  assert.equal(actionSource.includes('dismissListingReport(reportId)'), true);
  assert.equal(actionSource.includes('reopenListingReport(reportId)'), true);
  assert.equal(actionSource.includes('hideListingFromReport(reportId)'), true);
  assert.equal(actionSource.includes('restoreHiddenListing(listingId)'), true);
  assert.equal(pageSource.includes('report.reportState === \'dismissed\''), true);
  assert.equal(pageSource.includes('reopenListingReportAction'), true);
  assert.equal(actionSource.includes('AdminReportActionState'), true);
  assert.equal(actionSource.includes("messageKey: 'failed'"), true);
  assert.equal(adminSource.includes("rpc('current_user_is_admin'"), true);
  assert.equal(adminSource.includes("rpc('list_admin_listing_reports'"), true);
  assert.equal(adminSource.includes("rpc('dismiss_listing_report'"), true);
  assert.equal(adminSource.includes("rpc('reopen_listing_report'"), true);
  assert.equal(adminSource.includes("rpc('hide_listing_from_report'"), true);
  assert.equal(adminSource.includes("rpc('restore_hidden_listing'"), true);
  assert.equal(adminSource.includes('p_actor'), false);
  assert.equal(adminSource.includes('p_admin'), false);
});

test('phase 2I-A user-visible strings are routed through locale messages', () => {
  const pageSource = readFileSync(
    'src/app/[locale]/admin/reports/page.tsx',
    'utf8'
  );
  const actionFormSource = readFileSync(
    'src/app/[locale]/admin/reports/AdminReportActionForm.tsx',
    'utf8'
  );
  const accountSource = readFileSync(
    'src/app/[locale]/account/AccountDashboard.tsx',
    'utf8'
  );
  const ruMessages = JSON.parse(readFileSync('src/messages/ru.json', 'utf8'));
  const tyvMessages = JSON.parse(readFileSync('src/messages/tyv.json', 'utf8'));
  const phaseTranslationPaths = [
    'Account.moderationHiddenBadge',
    'Account.moderationHiddenMessage',
    'Account.adminReportsLabel',
    'ListingReport.alreadyReportedTitle',
    'ListingReport.alreadyReportedMessage',
    'ListingReport.alreadyReportedButton',
    'AdminReports.kicker',
    'AdminReports.title',
    'AdminReports.filtersAriaLabel',
    'AdminReports.emptyTitle',
    'AdminReports.emptyMessage',
    'AdminReports.notReviewed',
    'AdminReports.listingUnavailable',
    'AdminReports.missingListing',
    'AdminReports.reporterLabel',
    'AdminReports.sellerLabel',
    'AdminReports.filters.open',
    'AdminReports.filters.dismissed',
    'AdminReports.filters.listing_hidden',
    'AdminReports.filters.all',
    'AdminReports.table.listing',
    'AdminReports.table.report',
    'AdminReports.table.people',
    'AdminReports.table.state',
    'AdminReports.table.actions',
    'AdminReports.actions.dismiss',
    'AdminReports.actions.reopen',
    'AdminReports.actions.hideListing',
    'AdminReports.actions.restoreListing',
    'AdminReports.actionFeedback.dismissed',
    'AdminReports.actionFeedback.reopened',
    'AdminReports.actionFeedback.hidden',
    'AdminReports.actionFeedback.restored',
    'AdminReports.actionFeedback.failed',
    'AdminReports.reportStates.open',
    'AdminReports.reportStates.dismissed',
    'AdminReports.reportStates.listing_hidden',
    'AdminReports.moderationStates.normal',
    'AdminReports.moderationStates.hidden',
    'AdminReports.reasons.scam',
    'AdminReports.reasons.prohibited_item',
    'AdminReports.reasons.misleading',
    'AdminReports.reasons.duplicate_spam',
    'AdminReports.reasons.other',
  ];

  function getStringAtPath(
    messages: Record<string, unknown>,
    path: string
  ): string {
    const value = path.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') {
        return undefined;
      }

      return (current as Record<string, unknown>)[segment];
    }, messages);

    if (typeof value !== 'string') {
      assert.fail(`${path} must be a string`);
    }

    return value;
  }

  for (const source of [pageSource, actionFormSource, accountSource]) {
    assert.equal(source.includes('Hidden by moderation. You can still edit'), false);
    assert.equal(source.includes('No reports found'), false);
    assert.equal(source.includes('Hide listing'), false);
    assert.equal(source.includes('Reopen report'), false);
    assert.equal(source.includes('Restore listing'), false);
  }

  assert.equal(Boolean(ruMessages.AdminReports), true);
  assert.equal(Boolean(tyvMessages.AdminReports), true);

  for (const path of phaseTranslationPaths) {
    for (const [locale, messages] of [
      ['ru', ruMessages],
      ['tyv', tyvMessages],
    ] as const) {
      const value = getStringAtPath(messages, path);

      assert.notEqual(value.trim(), '', `${locale}.${path} must not be empty`);
      assert.equal(
        value.includes('[RU REVIEW]') || value.includes('[TYV REVIEW]'),
        false,
        `${locale}.${path} should be finalized for Phase 2I-A`
      );
    }
  }
});
