import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATIONS_DIR = 'supabase/migrations';
const NOTIFICATIONS_MIGRATION =
  'supabase/migrations/20260904_add_in_app_notifications.sql';

function readMigration(): string {
  return readFileSync(NOTIFICATIONS_MIGRATION, 'utf8');
}

function getFunctionDefinition(source: string, functionName: string): string {
  const startToken = `create or replace function public.${functionName}(`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${functionName} definition is missing`);

  const endIndex = source.indexOf('\n$$;', startIndex);

  assert.notEqual(endIndex, -1, `${functionName} definition is unterminated`);

  return source.slice(startIndex, endIndex + '\n$$;'.length);
}

function getPolicyDefinition(source: string, policyName: string): string {
  const startToken = `create policy "${policyName}"`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${policyName} policy is missing`);

  const endIndex = source.indexOf('\n);', startIndex);

  assert.notEqual(endIndex, -1, `${policyName} policy is unterminated`);

  return source.slice(startIndex, endIndex + '\n);'.length);
}

test('notifications migration follows the current migration order', () => {
  const migrationNames = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  assert.ok(
    migrationNames.indexOf('20260903_add_listing_report_read_state.sql') <
      migrationNames.indexOf('20260904_add_in_app_notifications.sql')
  );
});

test('notifications schema constrains known types and explicit references', () => {
  const migration = readMigration();

  assert.equal(migration.includes('begin;'), true);
  assert.equal(migration.includes('create table if not exists public.notifications'), true);
  assert.equal(migration.includes("'message_received'"), true);
  assert.equal(migration.includes("'review_received'"), true);
  assert.equal(migration.includes("'saved_listing_status_changed'"), true);
  assert.equal(migration.includes('conversation_id uuid references public.conversations'), true);
  assert.equal(migration.includes('review_id uuid references public.seller_reviews'), true);
  assert.equal(migration.includes('listing_title_snapshot text'), true);
  assert.equal(migration.includes('metadata jsonb'), false);
  assert.equal(migration.includes('entity_id'), false);
  assert.equal(migration.includes('actor_id is not null'), false);
});

test('notification RLS permits own reads and keeps read mutations behind RPCs', () => {
  const migration = readMigration();
  const selectPolicy = getPolicyDefinition(migration, 'notifications_select_own');

  assert.equal(migration.includes('alter table public.notifications enable row level security;'), true);
  assert.equal(migration.includes('grant select on public.notifications to authenticated;'), true);
  assert.equal(migration.includes('grant update (read_at) on public.notifications'), false);
  assert.equal(migration.includes('grant insert on public.notifications'), false);
  assert.equal(migration.includes('grant update on public.notifications'), false);
  assert.equal(selectPolicy.includes('user_id = (select auth.uid())'), true);
  assert.equal(migration.includes('notifications_update_own_read_at'), false);
});

test('message notifications are recipient-only and aggregated per conversation', () => {
  const migration = readMigration();
  const trigger = getFunctionDefinition(
    migration,
    'create_message_received_notification'
  );

  assert.equal(trigger.includes('security definer'), true);
  assert.equal(trigger.includes("set search_path = ''"), true);
  assert.equal(trigger.includes('recipient_id := case'), true);
  assert.equal(trigger.includes('recipient_id = new.sender_id'), true);
  assert.equal(trigger.includes("type = 'message_received'"), true);
  assert.equal(
    trigger.includes('on conflict (user_id, type, conversation_id)'),
    true
  );
  assert.equal(trigger.includes('read_at = null'), true);
  assert.equal(
    migration.includes('notifications_message_conversation_unique_idx'),
    true
  );
});

test('review notifications happen on insert only and are deduped by review', () => {
  const migration = readMigration();
  const trigger = getFunctionDefinition(
    migration,
    'create_review_received_notification'
  );

  assert.equal(trigger.includes("type = 'review_received'"), true);
  assert.equal(trigger.includes('new.seller_id = new.buyer_id'), true);
  assert.equal(
    trigger.includes('on conflict (user_id, type, review_id)'),
    true
  );
  assert.equal(
    migration.includes(
      'create trigger seller_reviews_create_review_received_notification\nafter insert on public.seller_reviews'
    ),
    true
  );
  assert.equal(
    migration.includes('after update on public.seller_reviews'),
    false
  );
});

test('saved listing notifications create historical events for each availability boundary change', () => {
  const migration = readMigration();
  const helper = getFunctionDefinition(migration, 'listing_status_is_saveable');
  const trigger = getFunctionDefinition(
    migration,
    'create_saved_listing_status_notifications'
  );

  assert.equal(helper.includes("p_status in ('active', 'reserved')"), true);
  assert.equal(trigger.includes('new.status is not distinct from old.status'), true);
  assert.equal(
    trigger.includes(
      'public.listing_status_is_saveable(new.status)\n     = public.listing_status_is_saveable(old.status)'
    ),
    true
  );
  assert.equal(trigger.includes("lf.listing_source = 'database'"), true);
  assert.equal(trigger.includes('lf.user_id <> new.owner_id'), true);
  assert.equal(
    trigger.includes('on conflict (user_id, type, listing_id)'),
    false
  );
  assert.equal(migration.includes('notifications_saved_listing_unique_idx'), false);
  assert.equal(migration.includes('after update of status on public.listings'), true);
  assert.equal(migration.includes('old.price'), false);
});

test('saved listing status history is not collapsed across repeated transitions', () => {
  const migration = readMigration();
  const trigger = getFunctionDefinition(
    migration,
    'create_saved_listing_status_notifications'
  );
  const firstUnavailableBoundary =
    "old.status,\n    new.status,\n    null,\n    now()";

  assert.equal(trigger.includes(firstUnavailableBoundary), true);
  assert.equal(trigger.includes('do update set'), false);
  assert.equal(trigger.includes('read_at = null,'), false);
  assert.equal(
    trigger.includes(
      'public.listing_status_is_saveable(new.status)\n     = public.listing_status_is_saveable(old.status)'
    ),
    true
  );
});

test('notification RPCs expose narrow current-user operations', () => {
  const migration = readMigration();
  const listRpc = getFunctionDefinition(migration, 'list_my_notifications');
  const countRpc = getFunctionDefinition(migration, 'count_unread_notifications');
  const markOneRpc = getFunctionDefinition(migration, 'mark_notification_read');
  const markAllRpc = getFunctionDefinition(migration, 'mark_all_notifications_read');
  const markConversationRead = getFunctionDefinition(
    migration,
    'mark_conversation_read'
  );

  assert.equal(listRpc.includes('where n.user_id = viewer_id'), true);
  assert.equal(listRpc.includes("'Marketplace user'"), false);
  assert.equal(listRpc.includes('nullif(btrim(p.display_name), \'\')::text'), true);
  assert.equal(countRpc.includes('n.read_at is null'), true);
  assert.equal(markOneRpc.includes('n.id = p_notification_id'), true);
  assert.equal(markOneRpc.includes('n.user_id = viewer_id'), true);
  assert.equal(markAllRpc.includes('n.user_id = viewer_id'), true);
  assert.equal(markAllRpc.includes('n.read_at is null'), true);
  assert.equal(markConversationRead.includes('read_boundary timestamptz'), true);
  assert.equal(markConversationRead.includes('read_boundary := now()'), true);
  assert.equal(markConversationRead.includes('read_boundary'), true);
  assert.equal(markConversationRead.includes('set read_at = coalesce(n.read_at, read_boundary)'), true);
  assert.equal(markConversationRead.includes("n.type = 'message_received'"), true);
  assert.equal(markConversationRead.includes('n.conversation_id = p_conversation_id'), true);
  assert.equal(markConversationRead.includes('m.id = n.message_id'), true);
  assert.equal(markConversationRead.includes('m.sender_id <> viewer_id'), true);
  assert.equal(markConversationRead.includes('m.created_at <= read_boundary'), true);
  assert.equal(migration.includes('grant execute on function public.list_my_notifications(integer, integer)\nto authenticated;'), true);
  assert.equal(migration.includes('grant execute on function public.mark_all_notifications_read()\nto authenticated;'), true);
});

test('notifications table is added to realtime publication once', () => {
  const migration = readMigration();

  assert.equal(migration.includes("tablename = 'notifications'"), true);
  assert.equal(
    migration.includes('alter publication supabase_realtime add table public.notifications;'),
    true
  );
});
