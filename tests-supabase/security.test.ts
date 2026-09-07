import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

function runLocalSql(sql: string): void {
  const result = spawnSync('psql', ['-v', 'ON_ERROR_STOP=1', '-Atc', sql], {
    encoding: 'utf8',
    env: pgEnvironment(dbUrl),
  });

  if (result.error) {
    throw result.error;
  }

  assert.equal(result.status, 0, result.stderr);
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
