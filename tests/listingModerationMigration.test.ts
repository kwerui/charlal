import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_PATH =
  'supabase/migrations/20260905_add_listing_moderation_foundation.sql';

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function getFunctionDefinition(source: string, functionName: string): string {
  const startToken = `create or replace function public.${functionName}(`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${functionName} definition is missing`);

  const endIndex = source.indexOf('\n$$;', startIndex);

  assert.notEqual(endIndex, -1, `${functionName} definition is unterminated`);

  return source.slice(startIndex, endIndex + '\n$$;'.length);
}

function getPolicyDefinition(
  source: string,
  policyName: string,
  tableName: string
): string {
  const startToken = `create policy "${policyName}"\non ${tableName}`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${policyName} policy is missing`);

  const endIndex = source.indexOf('\n);', startIndex);

  assert.notEqual(endIndex, -1, `${policyName} policy is unterminated`);

  return source.slice(startIndex, endIndex + '\n);'.length);
}

test('moderation foundation keeps admin roles and audit events private', () => {
  const migration = readMigration();

  assert.equal(migration.includes('create schema if not exists private;'), true);
  assert.equal(migration.includes('create table if not exists private.user_roles'), true);
  assert.equal(
    migration.includes('create table if not exists private.moderation_audit_events'),
    true
  );
  assert.equal(migration.includes('grant select on private.user_roles'), false);
  assert.equal(
    migration.includes('grant select on private.moderation_audit_events'),
    false
  );
  assert.equal(migration.includes('alter table private.user_roles enable row level security'), true);
  assert.equal(
    migration.includes('alter table private.moderation_audit_events enable row level security'),
    true
  );
});

test('admin functions are hardened and derive actor identity internally', () => {
  const migration = readMigration();
  const adminFunctions = [
    'current_user_is_admin',
    'list_admin_listing_reports',
    'dismiss_listing_report',
    'reopen_listing_report',
    'hide_listing_from_report',
    'restore_hidden_listing',
  ];

  for (const functionName of adminFunctions) {
    const definition = getFunctionDefinition(migration, functionName);

    assert.equal(definition.includes('security definer'), true);
    assert.equal(definition.includes("set search_path = ''"), true);
    assert.equal(
      definition.includes('p_actor') || definition.includes('p_admin'),
      false,
      `${functionName} must not accept caller-supplied actor/admin identity`
    );
  }

  assert.equal(
    getFunctionDefinition(migration, 'dismiss_listing_report').includes(
      'actor_id := auth.uid();'
    ),
    true
  );
  assert.equal(
    getFunctionDefinition(migration, 'hide_listing_from_report').includes(
      'actor_id := auth.uid();'
    ),
    true
  );
  assert.equal(
    getFunctionDefinition(migration, 'restore_hidden_listing').includes(
      'actor_id := auth.uid();'
    ),
    true
  );
  assert.equal(
    getFunctionDefinition(migration, 'reopen_listing_report').includes(
      'actor_id := auth.uid();'
    ),
    true
  );
});

test('listing moderation state is orthogonal to lifecycle status and enforced by RLS', () => {
  const migration = readMigration();
  const selectPolicy = migration.slice(
    migration.indexOf('create policy "listings_select_public"'),
    migration.indexOf('drop function if exists public.list_public_seller_listings')
  );

  assert.equal(
    migration.includes(
      "add column if not exists moderation_state text not null default 'normal'"
    ),
    true
  );
  assert.equal(
    migration.includes("check (moderation_state in ('normal', 'hidden'))"),
    true
  );
  assert.equal(migration.includes('grant update (moderation_state)'), false);
  assert.equal(selectPolicy.includes("moderation_state = 'normal'"), true);
  assert.equal(selectPolicy.includes("status in ('active', 'reserved')"), true);
  assert.equal(selectPolicy.includes("status <> 'archived'"), false);
  assert.equal(selectPolicy.includes('owner_id = (select auth.uid())'), true);
  assert.equal(
    migration.includes('create policy "listing_images_select_public"'),
    true
  );
});

test('listing image metadata visibility uses a hardened helper instead of caller table access', () => {
  const migration = readMigration();
  const helper = getFunctionDefinition(
    migration,
    'can_current_user_view_listing_image_metadata'
  );
  const selectPolicy = getPolicyDefinition(
    migration,
    'listing_images_select_public',
    'public.listing_images'
  );

  assert.equal(helper.includes('returns boolean'), true);
  assert.equal(helper.includes('security definer'), true);
  assert.equal(helper.includes("set search_path = ''"), true);
  assert.equal(helper.includes('viewer_id := auth.uid();'), true);
  assert.equal(helper.includes('from public.listings l'), true);
  assert.equal(helper.includes("l.moderation_state = 'normal'"), true);
  assert.equal(helper.includes("l.status in ('active', 'reserved')"), true);
  assert.equal(helper.includes('l.owner_id = viewer_id'), true);
  assert.equal(helper.includes("return false;"), true);
  assert.equal(
    helper.includes('p_actor') || helper.includes('p_admin') || helper.includes('p_user_id'),
    false
  );

  assert.equal(
    selectPolicy.includes(
      'public.can_current_user_view_listing_image_metadata(listing_images.listing_id)'
    ),
    true
  );
  assert.equal(selectPolicy.includes('from public.listings'), false);
  assert.equal(
    migration.includes(
      'alter function public.can_current_user_view_listing_image_metadata(text)\nowner to postgres;'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'revoke all on function public.can_current_user_view_listing_image_metadata(text) from public;'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'grant execute on function public.can_current_user_view_listing_image_metadata(text) to anon, authenticated;'
    ),
    true
  );
  assert.equal(migration.includes('grant select on public.listings to anon'), false);
  assert.equal(
    migration.includes('grant select on public.listings to authenticated'),
    false
  );
});

test('admin hide locks listing before selected report update and resolves all open reports', () => {
  const migration = readMigration();
  const hideFunction = getFunctionDefinition(migration, 'hide_listing_from_report');
  const restoreFunction = getFunctionDefinition(migration, 'restore_hidden_listing');
  const dismissFunction = getFunctionDefinition(migration, 'dismiss_listing_report');
  const firstReportReadIndex = hideFunction.indexOf('where lr.id = p_report_id;');
  const listingLockIndex = hideFunction.indexOf('for update;', firstReportReadIndex);
  const selectedReportLockIndex = hideFunction.indexOf(
    'where lr.id = p_report_id\n  for update;',
    listingLockIndex
  );

  assert.notEqual(firstReportReadIndex, -1);
  assert.notEqual(listingLockIndex, -1);
  assert.notEqual(selectedReportLockIndex, -1);
  assert.equal(firstReportReadIndex < listingLockIndex, true);
  assert.equal(listingLockIndex < selectedReportLockIndex, true);
  assert.equal(
    hideFunction.includes("where lr.listing_reference = report_record.listing_reference"),
    true
  );
  assert.equal(hideFunction.includes("lr.state = 'open'"), true);
  assert.equal(hideFunction.includes("state = 'listing_hidden'"), true);
  assert.equal(hideFunction.includes("'listing_hidden'"), true);
  assert.equal(hideFunction.includes("raise exception 'Report is already resolved'"), true);
  assert.equal(hideFunction.includes("raise exception 'Listing cannot be hidden'"), true);
  assert.equal(dismissFunction.includes("raise exception 'Report is already resolved'"), true);
  assert.equal(restoreFunction.includes("raise exception 'Listing is not hidden'"), true);
  assert.equal(restoreFunction.includes("'listing_restored'"), true);
  assert.equal(dismissFunction.includes("'report_dismissed'"), true);
  assert.equal(
    migration.includes('grant insert on private.moderation_audit_events'),
    false
  );
  assert.equal(
    migration.includes('grant update on private.moderation_audit_events'),
    false
  );
});

test('admin can reopen only dismissed reports without changing listing moderation state', () => {
  const migration = readMigration();
  const reopenFunction = getFunctionDefinition(migration, 'reopen_listing_report');

  assert.equal(
    migration.includes("'report_reopened'"),
    true
  );
  assert.equal(
    migration.includes(
      "action in (\n      'report_dismissed',\n      'report_reopened',\n      'listing_hidden',\n      'listing_restored'\n    )"
    ),
    true
  );
  assert.equal(reopenFunction.includes('security definer'), true);
  assert.equal(reopenFunction.includes("set search_path = ''"), true);
  assert.equal(reopenFunction.includes('actor_id := auth.uid();'), true);
  assert.equal(
    reopenFunction.includes('actor_id is null or not public.current_user_is_admin()'),
    true
  );
  assert.equal(reopenFunction.includes('for update;'), true);
  assert.equal(reopenFunction.includes("report_record.state <> 'dismissed'"), true);
  assert.equal(reopenFunction.includes("state = 'open'"), true);
  assert.equal(reopenFunction.includes('reviewed_at = null'), true);
  assert.equal(reopenFunction.includes('reviewed_by = null'), true);
  assert.equal(reopenFunction.includes("report_record.state <> 'open'"), false);
  assert.equal(reopenFunction.includes("report_record.state <> 'listing_hidden'"), false);
  assert.equal(reopenFunction.includes('set moderation_state'), false);
  assert.equal(reopenFunction.includes('from public.listings l'), true);
  assert.equal(reopenFunction.includes('listing_state,\n    listing_state'), true);
  assert.equal(reopenFunction.includes("'report_reopened'"), true);
  assert.equal(
    reopenFunction.includes(
      'Reporter already has an open report for this listing'
    ),
    true
  );
  assert.equal(
    migration.includes('grant execute on function public.reopen_listing_report(uuid) to authenticated;'),
    true
  );
  assert.equal(
    migration.includes('grant execute on function public.reopen_listing_report(uuid) to anon;'),
    false
  );
});

test('listing reports are unique only while open and historical rows are preserved', () => {
  const migration = readMigration();
  const reportListing = getFunctionDefinition(migration, 'report_listing');
  const hasReported = getFunctionDefinition(migration, 'has_reported_listing');

  assert.equal(
    migration.includes(
      'drop index if exists public.listing_reports_one_per_listing_reference_idx;'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'create unique index if not exists listing_reports_one_open_per_listing_reference_idx'
    ),
    true
  );
  assert.equal(
    migration.includes("where state = 'open';"),
    true
  );
  assert.equal(reportListing.includes("and lr.state = 'open'"), true);
  assert.equal(reportListing.includes('when unique_violation then'), true);
  assert.equal(
    reportListing.includes('on conflict (reporter_id, listing_reference) do nothing'),
    false
  );
  assert.equal(reportListing.includes('delete from public.listing_reports'), false);
  assert.equal(hasReported.includes("and lr.state = 'open'"), true);
  assert.equal(hasReported.includes('from public.listing_reports lr'), true);
  assert.equal(hasReported.includes('lr.reporter_id = viewer_id'), true);
  assert.equal(
    migration.includes('grant execute on function public.has_reported_listing(text) to authenticated;'),
    true
  );
});

test('public listing RPCs and write validators reject hidden listings', () => {
  const migration = readMigration();
  const publicSellerListings = getFunctionDefinition(
    migration,
    'list_public_seller_listings'
  );
  const sellerSlug = getFunctionDefinition(migration, 'get_listing_public_seller_slug');
  const sellerProfile = getFunctionDefinition(
    migration,
    'get_listing_public_seller_profile'
  );
  const startConversation = getFunctionDefinition(
    migration,
    'start_listing_conversation'
  );
  const canSave = getFunctionDefinition(migration, 'can_current_user_save_listing');
  const favoriteWrite = getFunctionDefinition(
    migration,
    'prepare_listing_favorite_write'
  );
  const reportListing = getFunctionDefinition(migration, 'report_listing');

  for (const definition of [
    publicSellerListings,
    sellerSlug,
    sellerProfile,
    startConversation,
    canSave,
    favoriteWrite,
    reportListing,
  ]) {
    assert.equal(definition.includes("moderation_state = 'normal'"), true);
    assert.equal(definition.includes("status in ('active', 'reserved')"), true);
  }
});

test('changed return-table functions are dropped before recreation and grants are restored', () => {
  const migration = readMigration();

  for (const signature of [
    'public.list_public_seller_listings(text)',
    'public.get_listing_public_seller_profile(text)',
    'public.list_my_listings()',
    'public.get_my_listing(text)',
  ]) {
    assert.equal(migration.includes(`drop function if exists ${signature};`), true);
    assert.equal(migration.includes(`grant execute on function ${signature}`), true);
  }
});
