import { spawnSync } from 'node:child_process';

const REQUIRED_RESET_FLAG = '--reset-local-db';
const EXPECTED_API_PORT = '54321';
const EXPECTED_DB_PORT = '54322';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);
const SECRET_STATUS_KEYS = new Set([
  'ANON_KEY',
  'JWT_SECRET',
  'PUBLISHABLE_KEY',
  'SECRET_KEY',
  'SERVICE_ROLE_KEY',
  'S3_PROTOCOL_ACCESS_KEY_ID',
  'S3_PROTOCOL_ACCESS_KEY_SECRET',
]);

function abort(message) {
  console.error(`Supabase security test harness aborted: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });

  if (result.error) {
    abort(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    abort(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }

  return result;
}

function extractJsonObject(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');

  if (start === -1 || end === -1 || end < start) {
    abort('supabase status did not return machine-readable JSON.');
  }

  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    abort('supabase status JSON could not be parsed.');
  }
}

function requireLocalHttpUrl(rawValue, label, expectedPort) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    abort(`${label} is missing from local Supabase status.`);
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    abort(`${label} is not a valid URL.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    abort(`${label} must be an HTTP URL.`);
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    abort(`${label} must target localhost or 127.0.0.1.`);
  }

  if (parsed.port !== expectedPort) {
    abort(`${label} must use local port ${expectedPort}.`);
  }

  return parsed;
}

function parseLocalDbUrl(rawValue) {
  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    abort('DB_URL is missing from local Supabase status.');
  }

  let parsed;
  try {
    parsed = new URL(rawValue);
  } catch {
    abort('DB_URL is not a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    abort('DB_URL must use the PostgreSQL protocol.');
  }

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    abort('DB_URL must target localhost or 127.0.0.1.');
  }

  if (parsed.port !== EXPECTED_DB_PORT) {
    abort(`DB_URL must use local port ${EXPECTED_DB_PORT}.`);
  }

  return parsed;
}

function requireStatusValue(status, key) {
  const value = status[key];

  if (typeof value !== 'string' || value.trim() === '') {
    abort(`${key} is missing from local Supabase status.`);
  }

  return value;
}

function assertNoForbiddenEnvironment() {
  if (process.env.CHARLAL_DB_URL) {
    abort('CHARLAL_DB_URL must not be set for this local-only command.');
  }
}

function assertNoProductionTargets(status) {
  for (const [key, value] of Object.entries(status)) {
    if (SECRET_STATUS_KEYS.has(key) || typeof value !== 'string') {
      continue;
    }

    const normalized = value.toLowerCase();

    if (
      normalized.includes('api.charlal.ru') ||
      normalized.includes('kgwybjaazpsnexmuqwqb.supabase.co')
    ) {
      abort(`${key} appears to target a production/cloud endpoint.`);
    }
  }
}

function pgEnvironment(dbUrl) {
  return {
    ...process.env,
    PGHOST: dbUrl.hostname,
    PGPORT: dbUrl.port,
    PGUSER: decodeURIComponent(dbUrl.username),
    PGPASSWORD: decodeURIComponent(dbUrl.password),
    PGDATABASE: decodeURIComponent(dbUrl.pathname.slice(1)),
  };
}

async function assertApiReachable(apiUrl, anonKey) {
  let response;

  try {
    response = await fetch(new URL('/rest/v1/', apiUrl), {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    abort(`local Supabase API is not reachable. Run "supabase start" first. ${message}`);
  }

  if (!response.ok) {
    abort(
      `local Supabase API returned HTTP ${response.status}. Run "supabase start" first.`
    );
  }
}

function assertPsqlAvailable() {
  const result = spawnSync('psql', ['--version'], { encoding: 'utf8' });

  if (result.error || result.status !== 0) {
    abort('psql is required for local DB safety checks but was not found on PATH.');
  }
}

function assertDbReachable(dbUrl) {
  const result = spawnSync(
    'psql',
    ['-v', 'ON_ERROR_STOP=1', '-Atc', 'select 1;'],
    {
      encoding: 'utf8',
      env: pgEnvironment(dbUrl),
    }
  );

  if (result.error || result.status !== 0 || result.stdout.trim() !== '1') {
    abort('local Supabase database is not reachable. Run "supabase start" first.');
  }
}

function assertLocalResetSupported() {
  const result = run('supabase', ['db', 'reset', '--help']);

  if (!result.stdout.includes('--local')) {
    abort('installed Supabase CLI does not support "supabase db reset --local".');
  }
}

function runWithInheritedOutput(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    ...options,
  });

  if (result.error) {
    abort(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    abort(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

if (!process.argv.slice(2).includes(REQUIRED_RESET_FLAG)) {
  abort(
    `refusing to reset local Supabase without ${REQUIRED_RESET_FLAG}. Run: npm run test:supabase -- ${REQUIRED_RESET_FLAG}`
  );
}

assertNoForbiddenEnvironment();

const status = extractJsonObject(run('supabase', ['status', '-o', 'json']).stdout);
assertNoProductionTargets(status);

const apiUrl = requireLocalHttpUrl(
  requireStatusValue(status, 'API_URL'),
  'API_URL',
  EXPECTED_API_PORT
);
const dbUrl = parseLocalDbUrl(requireStatusValue(status, 'DB_URL'));
const anonKey = requireStatusValue(status, 'ANON_KEY');
const serviceRoleKey = requireStatusValue(status, 'SERVICE_ROLE_KEY');

assertPsqlAvailable();
await assertApiReachable(apiUrl, anonKey);
assertDbReachable(dbUrl);
assertLocalResetSupported();

console.warn(
  'Running destructive LOCAL Supabase security tests. This will reset the local database and destroy local users/data.'
);
runWithInheritedOutput('supabase', ['db', 'reset', '--local', '--no-seed']);

runWithInheritedOutput('npx', ['tsc', '-p', 'tsconfig.supabase-test.json']);
runWithInheritedOutput(
  'node',
  ['--test', '.tmp-tests/supabase/security.test.js'],
  {
    env: {
      ...process.env,
      SUPABASE_TEST_API_URL: apiUrl.toString().replace(/\/$/, ''),
      SUPABASE_TEST_ANON_KEY: anonKey,
      SUPABASE_TEST_SERVICE_ROLE_KEY: serviceRoleKey,
      SUPABASE_TEST_DB_URL: dbUrl.toString(),
    },
  }
);
