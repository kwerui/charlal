import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type TestUser = {
  email: string;
  id: string;
  password: string;
};

type ListingRow = {
  id: string;
  title: string;
  status: string;
  moderation_state: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  client_attempt_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
};

type ModerationStateRow = {
  user_id: string;
  state: string;
  changed_at: string | null;
  changed_by: string | null;
};

const apiUrl = requireEnv('SUPABASE_TEST_API_URL');
const anonKey = requireEnv('SUPABASE_TEST_ANON_KEY');
const serviceRoleKey = requireEnv('SUPABASE_TEST_SERVICE_ROLE_KEY');
const dbUrl = requireEnv('SUPABASE_TEST_DB_URL');

const serviceClient = createClient(apiUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const anonClient = createClient(apiUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

let seller: TestUser;
let ordinaryUser: TestUser;
let sellerClient: SupabaseClient;
let ordinaryClient: SupabaseClient;
let publicListing: ListingRow;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function pgEnvironment(rawDbUrl: string): NodeJS.ProcessEnv {
  const parsed = new URL(rawDbUrl);

  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port,
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  };
}

function runLocalSql(sql: string): string {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
    env: pgEnvironment(dbUrl),
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, result.stderr);

  return result.stdout.trim();
}

function assertUuid(value: string): void {
  assert.match(
    value,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
}

function assertDatabaseListingId(value: string): void {
  assert.match(
    value,
    /^db-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  );
}

function sqlStringLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function listingFixtureInput(title: string, id?: string) {
  return {
    ...(id ? { id } : {}),
    title,
    description: 'Local executable authorization fixture.',
    price: 1200,
    location: 'Kyzyl',
    category: 'housing',
    subcategory: 'sale',
    transaction_type: 'sale',
    property_type: 'apartments',
  };
}

async function createListingFixture(
  client: SupabaseClient,
  title: string
): Promise<ListingRow> {
  const { data, error } = await client
    .from('listings')
    .insert(listingFixtureInput(title))
    .select('id, title, status, moderation_state')
    .single<ListingRow>();

  assert.equal(error, null);
  assert.ok(data);
  assertDatabaseListingId(data.id);
  assert.equal(data.status, 'active');
  assert.equal(data.moderation_state, 'normal');

  return data;
}

function suspendLocalUser(userId: string): void {
  assertUuid(userId);
  runLocalSql(
    `insert into private.user_moderation (user_id, state) values (${sqlStringLiteral(
      userId
    )}, 'suspended') on conflict (user_id) do update set state = 'suspended', changed_at = now();`
  );
}

function grantLocalAdminRole(userId: string): void {
  assertUuid(userId);
  runLocalSql(
    `insert into private.user_roles (user_id, role) values (${sqlStringLiteral(
      userId
    )}, 'admin') on conflict (user_id, role) do nothing;`
  );
}

async function createConversationFixture(label: string): Promise<{
  buyer: TestUser;
  buyerClient: SupabaseClient;
  conversationId: string;
  initialMessage: MessageRow;
  listing: ListingRow;
  seller: TestUser;
  sellerClient: SupabaseClient;
}> {
  const sellerFixture = await createLocalUser(`${label}-seller@example.test`);
  const buyerFixture = await createLocalUser(`${label}-buyer@example.test`);
  const sellerFixtureClient = await createAuthenticatedClient(sellerFixture);
  const buyerFixtureClient = await createAuthenticatedClient(buyerFixture);
  const listing = await createListingFixture(
    sellerFixtureClient,
    `${label} listing`
  );

  const { data: conversationId, error: startError } =
    await buyerFixtureClient.rpc('start_listing_conversation', {
      p_listing_id: listing.id,
      p_initial_message: `${label} initial message`,
    });

  assert.equal(startError, null);
  assert.equal(typeof conversationId, 'string');
  assertUuid(conversationId);

  const { data: messages, error: messagesError } = await buyerFixtureClient.rpc(
    'get_conversation_messages',
    {
      p_conversation_id: conversationId,
    }
  );

  assert.equal(messagesError, null);
  assert.ok(Array.isArray(messages));
  assert.equal(messages.length, 1);

  const initialMessage = messages[0] as MessageRow;
  assertUuid(initialMessage.id);
  assert.equal(initialMessage.conversation_id, conversationId);
  assert.equal(initialMessage.sender_id, buyerFixture.id);

  return {
    buyer: buyerFixture,
    buyerClient: buyerFixtureClient,
    conversationId,
    initialMessage,
    listing,
    seller: sellerFixture,
    sellerClient: sellerFixtureClient,
  };
}

async function createLocalUser(email: string): Promise<TestUser> {
  const password = 'local-h2a-password';
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  assert.equal(error, null);
  assert.ok(data.user?.id);

  return {
    email,
    id: data.user.id,
    password,
  };
}

async function createAuthenticatedClient(user: TestUser): Promise<SupabaseClient> {
  const client = createClient(apiUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  assert.equal(error, null);

  return client;
}

test.before(async () => {
  seller = await createLocalUser('h2a-seller@example.test');
  ordinaryUser = await createLocalUser('h2a-ordinary@example.test');

  sellerClient = await createAuthenticatedClient(seller);
  ordinaryClient = await createAuthenticatedClient(ordinaryUser);

  const { data, error } = await sellerClient
    .from('listings')
    .insert({
      title: 'H2-A public listing',
      description: 'Local executable security smoke fixture.',
      price: 1200,
      location: 'Kyzyl',
      category: 'housing',
      subcategory: 'sale',
      transaction_type: 'sale',
      property_type: 'apartments',
    })
    .select('id, title, status, moderation_state')
    .single<ListingRow>();

  assert.equal(error, null);
  assert.ok(data);
  assert.equal(data.status, 'active');
  assert.equal(data.moderation_state, 'normal');

  publicListing = data;
});

test('anonymous user can see a normal active public listing', async () => {
  const { data, error } = await anonClient
    .from('listings')
    .select('id, title, status, moderation_state')
    .eq('id', publicListing.id)
    .maybeSingle<ListingRow>();

  assert.equal(error, null);
  assert.deepEqual(data, publicListing);
});

test('anonymous user cannot see the same listing after it is hidden', async () => {
  runLocalSql(
    `update public.listings set moderation_state = 'hidden' where id = '${publicListing.id}';`
  );

  const { data, error } = await anonClient
    .from('listings')
    .select('id, title, status, moderation_state')
    .eq('id', publicListing.id)
    .maybeSingle<ListingRow>();

  assert.equal(error, null);
  assert.equal(data, null);
});

test('ordinary authenticated user cannot invoke admin moderation RPC', async () => {
  const { error } = await ordinaryClient.rpc('admin_get_user_moderation_state', {
    p_user_id: seller.id,
  });

  assert.ok(error, 'non-admin user unexpectedly invoked admin RPC');
  assert.match(error.message, /Admin access is required/i);
});

test('listing updates are allowed for the owner and blocked for a non-owner', async () => {
  const listing = await createListingFixture(
    sellerClient,
    'H2-B owner update listing'
  );

  const ownerTitle = 'H2-B owner updated title';
  const { data: ownerUpdate, error: ownerError } = await sellerClient
    .from('listings')
    .update({ title: ownerTitle })
    .eq('id', listing.id)
    .select('id, title, status, moderation_state')
    .maybeSingle<ListingRow>();

  assert.equal(ownerError, null);
  assert.ok(ownerUpdate);
  assert.equal(ownerUpdate.title, ownerTitle);

  const attemptedNonOwnerTitle = 'H2-B non-owner attempted title';
  const { error: nonOwnerError } = await ordinaryClient
    .from('listings')
    .update({ title: attemptedNonOwnerTitle })
    .eq('id', listing.id)
    .select('id, title, status, moderation_state')
    .maybeSingle<ListingRow>();

  if (nonOwnerError) {
    assert.match(nonOwnerError.message, /row|policy|permission|result/i);
  }

  const { data: persisted, error: persistedError } = await sellerClient
    .from('listings')
    .select('id, title, status, moderation_state')
    .eq('id', listing.id)
    .maybeSingle<ListingRow>();

  assert.equal(persistedError, null);
  assert.ok(persisted);
  assert.equal(persisted.title, ownerTitle);
});

test('suspended authenticated user cannot create a listing', async () => {
  const suspendedUser = await createLocalUser(
    'h2b-suspended-listing@example.test'
  );
  const suspendedClient = await createAuthenticatedClient(suspendedUser);
  const attemptedListingId = `db-${randomUUID()}`;

  assertDatabaseListingId(attemptedListingId);
  suspendLocalUser(suspendedUser.id);

  const { data, error } = await suspendedClient
    .from('listings')
    .insert(listingFixtureInput('H2-B suspended attempted listing', attemptedListingId))
    .select('id')
    .maybeSingle<{ id: string }>();

  assert.ok(error || data === null, 'suspended user unexpectedly inserted listing');

  const insertedCount = runLocalSql(
    `select count(*) from public.listings where id = ${sqlStringLiteral(
      attemptedListingId
    )};`
  );
  assert.equal(insertedCount, '0');
});

test('suspended user cannot add a favorite but can remove an existing favorite', async () => {
  const favoriteUser = await createLocalUser('h2b-favorite-user@example.test');
  const favoriteClient = await createAuthenticatedClient(favoriteUser);
  const firstListing = await createListingFixture(
    sellerClient,
    'H2-B favorite existing listing'
  );
  const secondListing = await createListingFixture(
    sellerClient,
    'H2-B favorite blocked listing'
  );

  const { error: initialFavoriteError } = await favoriteClient
    .from('listing_favorites')
    .insert({
      user_id: favoriteUser.id,
      listing_source: 'database',
      listing_id: firstListing.id,
    });

  assert.equal(initialFavoriteError, null);

  suspendLocalUser(favoriteUser.id);

  const { error: addWhileSuspendedError } = await favoriteClient
    .from('listing_favorites')
    .insert({
      user_id: favoriteUser.id,
      listing_source: 'database',
      listing_id: secondListing.id,
    });

  assert.ok(addWhileSuspendedError, 'suspended user unexpectedly added favorite');

  const { error: deleteWhileSuspendedError } = await favoriteClient
    .from('listing_favorites')
    .delete()
    .eq('user_id', favoriteUser.id)
    .eq('listing_source', 'database')
    .eq('listing_id', firstListing.id);

  assert.equal(deleteWhileSuspendedError, null);

  const { data: favorites, error: favoritesError } = await favoriteClient
    .from('listing_favorites')
    .select('listing_id')
    .eq('user_id', favoriteUser.id)
    .order('listing_id');

  assert.equal(favoritesError, null);
  assert.deepEqual(favorites, []);
});

test('suspended participant can still read existing message history', async () => {
  const fixture = await createConversationFixture('h2b-history');

  suspendLocalUser(fixture.buyer.id);

  const { data, error } = await fixture.buyerClient.rpc(
    'get_conversation_messages',
    {
      p_conversation_id: fixture.conversationId,
    }
  );

  assert.equal(error, null);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
  assert.equal((data[0] as MessageRow).id, fixture.initialMessage.id);
  assert.equal((data[0] as MessageRow).body, fixture.initialMessage.body);
});

test('new messages are blocked when either conversation participant is suspended', async () => {
  const fixture = await createConversationFixture('h2b-send-blocked');

  suspendLocalUser(fixture.buyer.id);

  const { error: suspendedSenderError } = await fixture.buyerClient.rpc(
    'send_conversation_message',
    {
      p_conversation_id: fixture.conversationId,
      p_body: 'Suspended sender attempted message',
      p_client_attempt_id: randomUUID(),
    }
  );

  assert.ok(suspendedSenderError, 'suspended sender unexpectedly sent message');

  const { data: afterSenderAttempt, error: afterSenderReadError } =
    await fixture.sellerClient.rpc('get_conversation_messages', {
      p_conversation_id: fixture.conversationId,
    });

  assert.equal(afterSenderReadError, null);
  assert.ok(Array.isArray(afterSenderAttempt));
  assert.equal(afterSenderAttempt.length, 1);

  const { error: suspendedParticipantError } = await fixture.sellerClient.rpc(
    'send_conversation_message',
    {
      p_conversation_id: fixture.conversationId,
      p_body: 'Other participant suspended attempted message',
      p_client_attempt_id: randomUUID(),
    }
  );

  assert.ok(
    suspendedParticipantError,
    'message was unexpectedly sent to suspended participant'
  );

  const { data: afterParticipantAttempt, error: afterParticipantReadError } =
    await fixture.sellerClient.rpc('get_conversation_messages', {
      p_conversation_id: fixture.conversationId,
    });

  assert.equal(afterParticipantReadError, null);
  assert.ok(Array.isArray(afterParticipantAttempt));
  assert.equal(afterParticipantAttempt.length, 1);
});

test('suspended sender cannot edit their own existing message', async () => {
  const fixture = await createConversationFixture('h2b-edit-blocked');

  suspendLocalUser(fixture.buyer.id);

  const { error } = await fixture.buyerClient.rpc('edit_conversation_message', {
    p_message_id: fixture.initialMessage.id,
    p_body: 'Suspended edit attempt',
  });

  assert.ok(error, 'suspended sender unexpectedly edited message');

  const { data, error: readError } = await fixture.sellerClient.rpc(
    'get_conversation_messages',
    {
      p_conversation_id: fixture.conversationId,
    }
  );

  assert.equal(readError, null);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);
  assert.equal((data[0] as MessageRow).id, fixture.initialMessage.id);
  assert.equal((data[0] as MessageRow).body, fixture.initialMessage.body);
});

test('local admin can invoke admin moderation RPC', async () => {
  const admin = await createLocalUser('h2b-admin@example.test');
  const target = await createLocalUser('h2b-admin-target@example.test');

  grantLocalAdminRole(admin.id);

  const adminClient = await createAuthenticatedClient(admin);
  const { data, error } = await adminClient.rpc(
    'admin_get_user_moderation_state',
    {
      p_user_id: target.id,
    }
  );

  assert.equal(error, null);
  assert.ok(Array.isArray(data));
  assert.equal(data.length, 1);

  const row = data[0] as ModerationStateRow;
  assert.equal(row.user_id, target.id);
  assert.equal(row.state, 'normal');
  assert.equal(row.changed_at, null);
  assert.equal(row.changed_by, null);
});
