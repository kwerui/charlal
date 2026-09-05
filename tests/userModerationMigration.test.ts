import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATION_PATH =
  'supabase/migrations/20260906_add_user_moderation_foundation.sql';
const MESSAGE_MANAGEMENT_MIGRATION_PATH =
  'supabase/migrations/20260816_add_message_management.sql';
const NOTIFICATIONS_MIGRATION_PATH =
  'supabase/migrations/20260904_add_in_app_notifications.sql';

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, 'utf8');
}

function readExistingMigration(path: string): string {
  return readFileSync(path, 'utf8');
}

function getFunctionDefinition(
  source: string,
  schemaName: 'public' | 'private',
  functionName: string
): string {
  const startToken = `create or replace function ${schemaName}.${functionName}(`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(
    startIndex,
    -1,
    `${schemaName}.${functionName} definition is missing`
  );

  const endIndex = source.indexOf('\n$$;', startIndex);

  assert.notEqual(
    endIndex,
    -1,
    `${schemaName}.${functionName} definition is unterminated`
  );

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

function assertBefore(
  source: string,
  beforeToken: string,
  afterToken: string,
  message: string
): void {
  const beforeIndex = source.indexOf(beforeToken);
  const afterIndex = source.indexOf(afterToken);

  assert.notEqual(beforeIndex, -1, `${beforeToken} is missing`);
  assert.notEqual(afterIndex, -1, `${afterToken} is missing`);
  assert.equal(beforeIndex < afterIndex, true, message);
}

test('user moderation state and audit tables are private and constrained', () => {
  const migration = readMigration();

  assert.equal(migration.includes('create schema if not exists private;'), true);
  assert.equal(
    migration.includes('create table if not exists private.user_moderation'),
    true
  );
  assert.equal(
    migration.includes('create table if not exists private.user_moderation_audit_events'),
    true
  );
  assert.equal(migration.includes("check (state in ('normal', 'suspended'))"), true);
  assert.equal(
    migration.includes("action in ('user_suspended', 'user_restored')"),
    true
  );
  assert.equal(migration.includes('target_user_id uuid not null'), true);
  assert.equal(migration.includes('references auth.users(id) on delete cascade'), true);
  assert.equal(
    migration.includes('actor_id uuid not null references auth.users(id)'),
    false,
    'audit actor must not cascade-delete historical audit rows'
  );
  assert.equal(
    migration.includes('target_user_id uuid not null references auth.users(id)'),
    false,
    'audit target must not cascade-delete historical audit rows'
  );
  assert.equal(
    migration.includes('alter table private.user_moderation enable row level security;'),
    true
  );
  assert.equal(
    migration.includes(
      'alter table private.user_moderation_audit_events enable row level security;'
    ),
    true
  );
  assert.equal(migration.includes('grant select on private.user_moderation'), false);
  assert.equal(
    migration.includes('grant select on private.user_moderation_audit_events'),
    false
  );
});

test('suspension helpers are hardened and treat missing rows as normal', () => {
  const migration = readMigration();
  const currentHelper = getFunctionDefinition(
    migration,
    'public',
    'current_user_is_suspended'
  );
  const privateHelper = getFunctionDefinition(
    migration,
    'private',
    'user_is_suspended'
  );

  for (const definition of [currentHelper, privateHelper]) {
    assert.equal(definition.includes('returns boolean'), true);
    assert.equal(definition.includes('security definer'), true);
    assert.equal(definition.includes("set search_path = ''"), true);
    assert.equal(definition.includes('from private.user_moderation um'), true);
    assert.equal(definition.includes("um.state = 'suspended'"), true);
  }

  assert.equal(currentHelper.includes('viewer_id := auth.uid();'), true);
  assert.equal(currentHelper.includes('p_user_id'), false);
  assert.equal(currentHelper.includes('return false;'), true);
  assert.equal(privateHelper.includes('p_user_id uuid'), true);
  assert.equal(privateHelper.includes('if p_user_id is null then'), true);
  assert.equal(
    migration.includes(
      'grant execute on function public.current_user_is_suspended() to authenticated;'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'grant execute on function private.user_is_suspended(uuid)'
    ),
    false
  );
  assert.equal(
    migration.includes(
      'revoke all on function private.user_is_suspended(uuid) from authenticated;'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'revoke all on function private.user_is_suspended(uuid) from anon;'
    ),
    true
  );
});

test('admin moderation RPCs use role-stable authorization and protect admins from suspension', () => {
  const migration = readMigration();
  const inspect = getFunctionDefinition(
    migration,
    'public',
    'admin_get_user_moderation_state'
  );
  const suspend = getFunctionDefinition(migration, 'public', 'suspend_user');
  const restore = getFunctionDefinition(migration, 'public', 'restore_user');

  for (const definition of [inspect, suspend, restore]) {
    assert.equal(definition.includes('security definer'), true);
    assert.equal(definition.includes("set search_path = ''"), true);
    assert.equal(definition.includes('not public.current_user_is_admin()'), true);
    assert.equal(definition.includes('p_actor'), false);
    assert.equal(definition.includes('p_admin'), false);
  }

  assert.equal(suspend.includes('actor_id := auth.uid();'), true);
  assert.equal(restore.includes('actor_id := auth.uid();'), true);
  assert.equal(suspend.includes('target_user_id = actor_id'), true);
  assert.equal(suspend.includes("raise exception 'Admin cannot suspend themselves'"), true);
  assert.equal(suspend.includes('from private.user_roles ur'), true);
  assert.equal(suspend.includes("ur.role = 'admin'"), true);
  assert.equal(
    suspend.includes("raise exception 'Admin users cannot be suspended'"),
    true
  );
  assert.equal(suspend.includes("'user_suspended'"), true);
  assert.equal(restore.includes("'user_restored'"), true);
  assert.equal(suspend.includes('for update'), true);
  assert.equal(restore.includes('for update'), true);
  assert.equal(suspend.includes('pg_advisory_xact_lock'), true);
  assert.equal(restore.includes('pg_advisory_xact_lock'), true);
  assert.equal(inspect.includes("coalesce(um.state, 'normal')"), true);

  for (const definition of [suspend, restore]) {
    assert.equal(
      definition.includes(
        'lock table private.user_roles in share row exclusive mode;'
      ),
      true
    );
    assertBefore(
      definition,
      'lock table private.user_roles in share row exclusive mode;',
      'not public.current_user_is_admin()',
      'actor admin authorization must be checked while role writes are blocked'
    );
    assertBefore(
      definition,
      'lock table private.user_roles in share row exclusive mode;',
      'pg_advisory_xact_lock',
      'role table lock must be taken before target mutation locks'
    );
    assertBefore(
      definition,
      'pg_advisory_xact_lock',
      'from auth.users u',
      'target advisory lock must precede target auth user row lock'
    );
  }

  assertBefore(
    suspend,
    'lock table private.user_roles in share row exclusive mode;',
    'from private.user_roles ur',
    'target admin check must run while role writes are blocked'
  );
});

test('public listing visibility requires normal owner moderation without losing owner reads', () => {
  const migration = readMigration();
  const listingsPolicy = getPolicyDefinition(
    migration,
    'listings_select_public',
    'public.listings'
  );
  const imageHelper = getFunctionDefinition(
    migration,
    'public',
    'can_current_user_view_listing_image_metadata'
  );
  const publicSellerProfile = getFunctionDefinition(
    migration,
    'public',
    'get_public_seller_profile'
  );

  assert.equal(
    listingsPolicy.includes('public.listing_is_publicly_visible(id)'),
    true
  );
  assert.equal(listingsPolicy.includes('owner_id = (select auth.uid())'), true);
  assert.equal(listingsPolicy.includes('private.user_is_suspended'), false);

  const listingVisibility = getFunctionDefinition(
    migration,
    'public',
    'listing_is_publicly_visible'
  );

  assert.equal(listingVisibility.includes("moderation_state = 'normal'"), true);
  assert.equal(
    listingVisibility.includes("status in ('active', 'reserved')"),
    true
  );
  assert.equal(
    listingVisibility.includes('not private.user_is_suspended(l.owner_id)'),
    true
  );
  assert.equal(imageHelper.includes('not private.user_is_suspended(l.owner_id)'), true);
  assert.equal(publicSellerProfile.includes('not private.user_is_suspended(p.id)'), true);
});

test('public listing RPCs and validators reject suspended sellers and users', () => {
  const migration = readMigration();
  const publicFunctions = [
    'list_public_seller_listings',
    'get_listing_public_seller_slug',
    'get_listing_public_seller_profile',
    'can_current_user_save_listing',
    'prepare_listing_favorite_write',
    'report_listing',
    'start_listing_conversation',
  ];

  for (const functionName of publicFunctions) {
    const definition = getFunctionDefinition(migration, 'public', functionName);

    assert.equal(
      definition.includes('private.user_is_suspended'),
      true,
      `${functionName} must check suspension`
    );
  }

  assert.equal(
    getFunctionDefinition(migration, 'public', 'can_current_user_save_listing')
      .includes('public.current_user_is_suspended()'),
    true
  );
  assert.equal(
    getFunctionDefinition(migration, 'public', 'report_listing').includes(
      "raise exception 'Suspended users cannot report listings'"
    ),
    true
  );
});

test('content mutation policies and triggers block suspended users but favorite removal stays allowed', () => {
  const migration = readMigration();
  const blockedPolicies = [
    ['listings_insert_own', 'public.listings'],
    ['listings_update_own', 'public.listings'],
    ['listings_delete_own', 'public.listings'],
    ['listing_images_insert_owner', 'public.listing_images'],
    ['listing_images_update_owner', 'public.listing_images'],
    ['listing_images_delete_owner', 'public.listing_images'],
    ['listing_favorites_insert_own', 'public.listing_favorites'],
    ['seller_reviews_insert_buyer', 'public.seller_reviews'],
    ['seller_reviews_update_buyer', 'public.seller_reviews'],
    ['profile_avatars_storage_insert_owner', 'storage.objects'],
    ['profile_avatars_storage_delete_owner', 'storage.objects'],
    ['listing_images_storage_insert_owner', 'storage.objects'],
    ['listing_images_storage_delete_owner', 'storage.objects'],
    ['message_attachments_storage_insert_participant', 'storage.objects'],
    ['message_attachments_storage_delete_owner', 'storage.objects'],
  ] as const;

  for (const [policyName, tableName] of blockedPolicies) {
    const policy = getPolicyDefinition(migration, policyName, tableName);

    assert.equal(
      policy.includes('current_user_is_suspended') ||
        policy.includes('private.user_is_suspended') ||
        policy.includes('private.current_user_can_message_conversation') ||
        policy.includes('public.current_user_can_message_conversation'),
      true,
      `${policyName} must include a suspension guard`
    );
  }

  const favoriteDelete = getPolicyDefinition(
    migration,
    'listing_favorites_delete_own',
    'public.listing_favorites'
  );

  assert.equal(favoriteDelete.includes('current_user_is_suspended'), false);
  assert.equal(favoriteDelete.includes('user_id = (select auth.uid())'), true);

  const profilePolicy = getPolicyDefinition(
    migration,
    'profiles_update_own',
    'public.profiles'
  );

  assert.equal(profilePolicy.includes('not public.current_user_is_suspended()'), true);
});

test('listing/status/review/message RPCs block suspended mutations and preserve read-state writes', () => {
  const migration = readMigration();
  const blockedFunctions = [
    ['public', 'prepare_listing_insert'],
    ['public', 'prepare_listing_update'],
    ['public', 'record_completed_listing_sale'],
    ['public', 'set_current_profile_avatar'],
    ['public', 'prepare_seller_review_insert'],
    ['public', 'prepare_seller_review_update'],
    ['public', 'delete_own_seller_review'],
    ['public', 'send_conversation_message'],
    ['public', 'send_conversation_message_with_attachments'],
    ['public', 'edit_conversation_message'],
    ['public', 'delete_conversation_message_with_attachments'],
  ] as const;

  for (const [schemaName, functionName] of blockedFunctions) {
    const definition = getFunctionDefinition(migration, schemaName, functionName);

    assert.equal(
      definition.includes('current_user_is_suspended') ||
        definition.includes('private.current_user_can_message_conversation'),
      true,
      `${functionName} must block suspended content mutation`
    );
  }

  for (const allowedFunction of [
    'hide_conversation_for_current_user',
  ]) {
    const definition = getFunctionDefinition(
      readExistingMigration(MESSAGE_MANAGEMENT_MIGRATION_PATH),
      'public',
      allowedFunction
    );

    assert.equal(
      definition.includes('current_user_is_suspended'),
      false,
      `${allowedFunction} must remain allowed for suspended users`
    );
  }

  for (const allowedFunction of [
    'mark_conversation_read',
    'mark_notification_read',
    'mark_all_notifications_read',
  ]) {
    const definition = getFunctionDefinition(
      readExistingMigration(NOTIFICATIONS_MIGRATION_PATH),
      'public',
      allowedFunction
    );

    assert.equal(
      definition.includes('current_user_is_suspended'),
      false,
      `${allowedFunction} must remain allowed for suspended users`
    );
  }
});

test('messaging and attachment helpers block if either participant is suspended', () => {
  const migration = readMigration();
  const canMessage = getFunctionDefinition(
    migration,
    'private',
    'current_user_can_message_conversation'
  );
  const publicCanMessage = getFunctionDefinition(
    migration,
    'public',
    'current_user_can_message_conversation'
  );
  const startConversation = getFunctionDefinition(
    migration,
    'public',
    'start_listing_conversation'
  );
  const attachmentPolicy = getPolicyDefinition(
    migration,
    'message_attachments_storage_insert_participant',
    'storage.objects'
  );

  assert.equal(canMessage.includes('private.user_is_suspended(viewer_id)'), true);
  assert.equal(canMessage.includes('private.user_is_suspended(c.buyer_id)'), true);
  assert.equal(canMessage.includes('private.user_is_suspended(c.seller_id)'), true);
  assert.equal(
    startConversation.includes('private.user_is_suspended(verified_buyer_id)'),
    true
  );
  assert.equal(
    startConversation.includes('private.user_is_suspended(listing_record.owner_id)'),
    true
  );
  assert.equal(
    attachmentPolicy.includes(
      'public.current_user_can_message_conversation((storage.foldername(name))[1]::uuid)'
    ),
    true
  );
  assert.equal(publicCanMessage.includes('auth.uid()'), false);
  assert.equal(
    publicCanMessage.includes(
      'private.current_user_can_message_conversation(p_conversation_id)'
    ),
    true
  );
  assert.equal(
    migration.includes(
      'grant execute on function private.current_user_can_message_conversation(uuid)'
    ),
    false
  );
  assert.equal(
    migration.includes(
      'grant execute on function public.current_user_can_message_conversation(uuid) to authenticated;'
    ),
    true
  );
});

test('existing listing moderation audit remains listing-specific and user audit is separate', () => {
  const migration = readMigration();

  assert.equal(
    migration.includes('alter table private.moderation_audit_events'),
    false
  );
  assert.equal(
    migration.includes('private.user_moderation_audit_events'),
    true
  );
  assert.equal(migration.includes("'report_dismissed'"), false);
  assert.equal(migration.includes("'listing_hidden'"), false);
});

test('no broad grants or profile moderation fields are introduced', () => {
  const migration = readMigration();

  assert.equal(migration.includes('add column if not exists is_banned'), false);
  assert.equal(migration.includes('add column if not exists is_admin'), false);
  assert.equal(migration.includes('add column if not exists moderation_state'), false);
  assert.equal(migration.includes('grant select on private.'), false);
  assert.equal(migration.includes('grant update on private.'), false);
  assert.equal(migration.includes('grant insert on private.'), false);
  assert.equal(migration.includes('grant delete on private.'), false);
  assert.equal(
    migration.includes('grant usage on schema private to anon'),
    false
  );
  assert.equal(
    migration.includes('grant usage on schema private to authenticated;'),
    true
  );
  assert.equal(
    migration.includes('grant execute on function public.listing_is_publicly_visible(text) to anon, authenticated;'),
    true
  );
});

test('direct RLS policies do not call arbitrary private suspension or messaging helpers', () => {
  const migration = readMigration();
  const policyNames = [
    ['listings_select_public', 'public.listings'],
    ['listing_images_select_public', 'public.listing_images'],
    ['messages_insert_participant', 'public.messages'],
    ['message_attachments_storage_insert_participant', 'storage.objects'],
    ['message_attachments_storage_delete_owner', 'storage.objects'],
  ] as const;

  for (const [policyName, tableName] of policyNames) {
    const policy = getPolicyDefinition(migration, policyName, tableName);

    assert.equal(
      policy.includes('private.user_is_suspended'),
      false,
      `${policyName} must not call arbitrary-user suspension helper directly`
    );
    assert.equal(
      policy.includes('private.current_user_can_message_conversation'),
      false,
      `${policyName} must not require direct app-role execute on private messaging helper`
    );
  }
});
