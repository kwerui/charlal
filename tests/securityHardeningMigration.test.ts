import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATIONS_DIR = 'supabase/migrations';
const HARDENING_MIGRATION =
  'supabase/migrations/20260826_security_hardening.sql';

function readMigration(path: string): string {
  return readFileSync(path, 'utf8');
}

function getFunctionDefinition(source: string, functionName: string): string {
  const startToken = `create or replace function public.${functionName}(`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${functionName} definition is missing`);

  const endIndex = source.indexOf('\n$$;', startIndex);

  assert.notEqual(endIndex, -1, `${functionName} definition is unterminated`);

  return source.slice(startIndex, endIndex + '\n$$;'.length);
}

test('security hardening is ordered after message attachments', () => {
  const migrationNames = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  assert.ok(
    migrationNames.indexOf('20260822_add_message_attachments.sql') <
      migrationNames.indexOf('20260826_security_hardening.sql')
  );
});

test('security hardening keeps message insert trigger attachment-compatible', () => {
  const hardening = readMigration(HARDENING_MIGRATION);
  const prepareMessageInsert = getFunctionDefinition(
    hardening,
    'prepare_message_insert'
  );

  assert.equal(
    prepareMessageInsert.includes("new.body := btrim(coalesce(new.body, ''));"),
    true
  );
  assert.equal(prepareMessageInsert.includes('length(new.body) = 0'), false);
  assert.equal(
    prepareMessageInsert.includes("'Message body cannot be empty'"),
    false
  );
  assert.equal(
    prepareMessageInsert.includes(
      "m.created_at > now() - interval '1 minute'"
    ),
    true
  );
  assert.equal(
    prepareMessageInsert.includes("m.created_at > now() - interval '1 hour'"),
    true
  );
  assert.equal(
    prepareMessageInsert.includes(
      'c.buyer_id = verified_sender_id or c.seller_id = verified_sender_id'
    ),
    true
  );
});

test('security hardening deploys listing owner RPCs without public owner column reads', () => {
  const hardening = readMigration(HARDENING_MIGRATION);
  const listingGrantStart = hardening.indexOf('grant select (');
  const listingGrantEndToken = ') on public.listings to anon, authenticated;';
  const listingGrantEndIndex = hardening.indexOf(listingGrantEndToken);

  assert.notEqual(listingGrantStart, -1, 'listing column grant is missing');
  assert.notEqual(
    listingGrantEndIndex,
    -1,
    'listing column grant is unterminated'
  );

  const listingGrant = hardening.slice(
    listingGrantStart,
    listingGrantEndIndex + listingGrantEndToken.length
  );

  assert.equal(hardening.includes('public.list_my_listings()'), true);
  assert.equal(
    hardening.includes('public.list_current_user_owned_listing_ids(text[])'),
    true
  );
  assert.equal(
    hardening.includes('public.can_current_user_save_listing(text)'),
    true
  );
  assert.equal(listingGrant.includes('owner_id'), false);
});
