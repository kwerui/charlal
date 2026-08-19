import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATIONS_DIR = 'supabase/migrations';
const HARDENING_MIGRATION =
  'supabase/migrations/20260826_security_hardening.sql';
const STORAGE_RECURSION_FIX_MIGRATION =
  'supabase/migrations/20260827_fix_storage_upload_policy_recursion.sql';

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

function getSchemaFunctionDefinition(
  source: string,
  schemaName: string,
  functionName: string
): string {
  const startToken = `create or replace function ${schemaName}.${functionName}(`;
  const startIndex = source.indexOf(startToken);

  assert.notEqual(startIndex, -1, `${schemaName}.${functionName} is missing`);

  const endIndex = source.indexOf('\n$$;', startIndex);

  assert.notEqual(
    endIndex,
    -1,
    `${schemaName}.${functionName} definition is unterminated`
  );

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

test('storage upload rate limits are not recursive storage object policies', () => {
  const migrationNames = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  const fix = readMigration(STORAGE_RECURSION_FIX_MIGRATION);
  const helper = getSchemaFunctionDefinition(
    fix,
    'private',
    'current_user_storage_uploads_below_limit'
  );

  assert.ok(
    migrationNames.indexOf('20260826_security_hardening.sql') <
      migrationNames.indexOf('20260827_fix_storage_upload_policy_recursion.sql')
  );
  assert.equal(fix.includes('create schema if not exists private;'), true);
  assert.equal(fix.includes('grant usage on schema private to authenticated;'), true);
  assert.equal(helper.includes('security definer'), true);
  assert.equal(helper.includes("set search_path = ''"), true);
  assert.equal(helper.includes('from storage.objects so'), true);
  assert.equal(
    fix.includes(
      'alter function private.current_user_storage_uploads_below_limit(text)'
    ),
    true
  );
  assert.equal(fix.includes('owner to postgres;'), true);
  assert.equal(
    fix.includes(
      'grant execute\non function private.current_user_storage_uploads_below_limit(text)\nto authenticated;'
    ),
    true
  );
  assert.equal(
    fix.includes(
      'grant execute\non function private.current_user_storage_uploads_below_limit(text)\nto anon;'
    ),
    false
  );
  assert.equal(
    fix.includes(
      'grant execute\non function private.current_user_storage_uploads_below_limit(text)\nto public;'
    ),
    false
  );
  assert.equal(fix.includes('message_attachments_storage'), false);

  const policies = [
    {
      name: 'listing_images_storage_insert_owner',
      bucket: 'listing-images',
      limit: "when 'listing-images' then 100",
      ownershipCheck: 'from public.listings l',
    },
    {
      name: 'profile_avatars_storage_insert_owner',
      bucket: 'profile-avatars',
      limit: "when 'profile-avatars' then 20",
      ownershipCheck: 'from public.profiles p',
    },
    {
      name: 'review_media_storage_insert_buyer',
      bucket: 'review-media',
      limit: "when 'review-media' then 30",
      ownershipCheck: 'public.current_user_owns_seller_review_path(name)',
    },
  ];

  for (const policy of policies) {
    const definition = getPolicyDefinition(fix, policy.name);

    assert.equal(
      fix.includes(`drop policy if exists "${policy.name}" on storage.objects;`),
      true
    );
    assert.equal(definition.includes('on storage.objects'), true);
    assert.equal(definition.includes('for insert'), true);
    assert.equal(definition.includes('from storage.objects'), false);
    assert.equal(definition.includes(`bucket_id = '${policy.bucket}'`), true);
    assert.equal(
      definition.includes('owner_id = (select auth.uid())::text'),
      true
    );
    assert.equal(definition.includes('lower(storage.extension(name))'), true);
    assert.equal(
      definition.includes(
        `private.current_user_storage_uploads_below_limit('${policy.bucket}')`
      ),
      true
    );
    assert.equal(definition.includes(policy.ownershipCheck), true);
    assert.equal(helper.includes(policy.limit), true);
  }
});
