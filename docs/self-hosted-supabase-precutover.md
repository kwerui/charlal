# Self-Hosted Supabase Pre-Cutover Prerequisites

Date: 2026-08-25

This runbook records what a fresh self-hosted Supabase environment must provide
before Charlal's existing migrations and Next.js app can run. It does not
change application behavior, add migrations, or duplicate Supabase-managed
objects.

## Source Baseline

- Charlal migrations inspected: `supabase/migrations/20260806_create_profiles.sql`
  through `supabase/migrations/20260901_remove_builtin_listing_favorites.sql`.
- Application configuration inspected: `next.config.ts`, `proxy.ts`,
  `src/lib/supabase/*`, `src/lib/auth/*`, auth callback routes, Realtime usage,
  and `.env.example`.
- Supabase self-hosting references:
  - Supabase Docker self-hosting guide:
    https://supabase.com/docs/guides/self-hosting/docker
  - Supabase Storage schema guide:
    https://supabase.com/docs/guides/storage/schema/design
  - Supabase Auth self-hosting config:
    https://supabase.com/docs/guides/self-hosting/auth/config
  - Supabase Realtime self-hosting config:
    https://supabase.com/docs/guides/self-hosting/realtime/config
  - Supabase Postgres roles guide:
    https://supabase.com/docs/guides/database/postgres/roles
  - Supabase Postgres init scripts:
    https://github.com/supabase/postgres/tree/develop/migrations/db/init-scripts
  - PostgreSQL `pgcrypto` docs:
    https://www.postgresql.org/docs/current/pgcrypto.html

## Migration Dependency Classification

| Dependency | Used by Charlal | Classification | Notes |
| --- | --- | --- | --- |
| PostgreSQL tables, indexes, triggers, constraints, RLS, policies, PL/pgSQL, `now()`, regex operators, arrays, `jsonb`, `uuid`, `timestamptz` | All migrations | A. standard PostgreSQL capability | No Charlal bootstrap needed beyond a healthy Supabase Postgres database. |
| `public` schema | All project tables/functions | B. Supabase platform bootstrap | Supabase init grants API roles access to `public`; Charlal creates project objects inside it. |
| `gen_random_uuid()` | IDs/slugs in listings, messaging, images, reviews, reports | B. Supabase platform bootstrap | Do not add a Charlal extension migration. Current PostgreSQL exposes a core `gen_random_uuid()` and Supabase init scripts also install `pgcrypto` in `extensions`; PostgreSQL documents `pgcrypto`'s function as delegating to the core function. Preflight with `select to_regprocedure('gen_random_uuid()');`. |
| `auth` schema | FK targets, policies, RPCs | B. Supabase platform bootstrap | Supabase Auth initializes this schema. |
| `auth.users` | Profile trigger and many foreign keys | B. Supabase platform bootstrap | Must exist before `20260806_create_profiles.sql`. |
| `auth.uid()` | RLS policies and security definer RPCs | B. Supabase platform bootstrap | Supabase Auth init creates request-claim helper functions. |
| API roles `anon`, `authenticated`, `service_role`, `authenticator`, `postgres` | Grants, revokes, policies | B. Supabase platform bootstrap | Supabase roles guide lists these as default roles configured when starting a project. |
| `storage` schema | Bucket rows, object policies, helper functions | B. Supabase platform bootstrap | Supabase Storage owns metadata tables/functions. Charlal only inserts bucket rows and adds policies. |
| `storage.buckets` | Bucket definitions | B. Supabase platform bootstrap | Charlal creates the four required bucket records with `insert ... on conflict`. |
| `storage.objects` | Storage RLS policies and upload-rate helper checks | B. Supabase platform bootstrap | Must exist before image/avatar/message/review storage migrations. |
| `storage.foldername(text)` and `storage.extension(text)` | Storage object policies | B. Supabase platform bootstrap | These are Storage helper functions expected from Supabase Storage migrations. |
| `supabase_realtime` publication | Messaging publication membership | B. Supabase platform bootstrap | Supabase Postgres init creates an empty publication. Charlal migrations add project tables only. |
| Realtime logical replication/WAL slot capability | Realtime service | B. Supabase platform bootstrap | Realtime self-hosting config requires publication, slot, database connection, JWT, and polling settings. |
| `private` schema | Storage upload helper functions | C. Charlal migrations | Created by `20260827_fix_storage_upload_policy_recursion.sql` and reused/expanded later. |
| Charlal public tables/functions/policies/triggers | Marketplace behavior | C. Charlal migrations | Created in timestamp order by project migrations. |
| Missing platform or project object | None proven | D. missing Charlal-specific bootstrap work | No new Charlal migration is currently justified. |

## Required Order on a Fresh Self-Hosted Installation

1. Initialize the Supabase platform stack with Docker or the chosen supported
   self-hosting path.
2. Start Supabase services and allow platform database init scripts and service
   migrations to complete for Postgres, Auth, Storage, PostgREST, and Realtime.
3. Configure platform secrets, public URLs, Auth URLs, SMTP/domain mail settings,
   Storage persistence, and Realtime replication settings.
4. Run the non-destructive preflight checks in this document.
5. Apply Charlal migrations in filename order from
   `supabase/migrations/20260806_create_profiles.sql` through
   `supabase/migrations/20260901_remove_builtin_listing_favorites.sql`.
6. Configure Charlal application environment variables.
7. Start the Next.js application.
8. Run Charlal smoke tests for Auth, listings, Storage uploads/downloads,
   messaging, Realtime, favorites, and reviews.

## Storage Bootstrap Requirements

Charlal expects these buckets and creates each bucket row in project SQL:

| Bucket | Created by | Public | Limit | MIME types |
| --- | --- | --- | --- | --- |
| `listing-images` | `20260817_add_listing_images.sql` | yes | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `profile-avatars` | `20260819_add_profile_avatars.sql` | yes | 5 MB | `image/jpeg`, `image/png`, `image/webp` |
| `message-attachments` | `20260822_add_message_attachments.sql` | no | 8 MB | `image/jpeg`, `image/png`, `image/webp` |
| `review-media` | `20260824_add_seller_reviews.sql` | yes | 5 MB | `image/jpeg`, `image/png`, `image/webp` |

Supabase self-hosting must provide the Storage API service, the `storage`
schema, `storage.buckets`, `storage.objects`, Storage helper functions, required
roles/grants, and durable object persistence before these migrations run.
Supabase's Storage schema documentation states that the schema stores metadata
for buckets and objects, while actual objects live in the configured storage
backend. For Charlal, that means the self-hosted server must have either a
durable local bind mount/volume or an S3-compatible backend configured before
users upload media.

Do not create buckets outside Charlal migrations. The project SQL owns bucket
metadata rows and access policies; the platform owns the schema and service.

## Realtime Bootstrap Requirements

Charlal messaging uses Supabase Realtime Postgres Changes. The project
migrations assume an existing `supabase_realtime` publication:

- `20260810_enable_messaging_realtime_and_receipts.sql` adds
  `public.messages` and `public.conversation_reads`.
- `20260816_add_message_management.sql` adds
  `public.conversation_user_state`.
- `20260822_add_message_attachments.sql` adds
  `public.message_attachments`.

Supabase's Postgres init script creates the empty `supabase_realtime`
publication during platform bootstrap. Charlal must not recreate, drop, or own
that publication.

The self-hosted platform must have Realtime running with:

- logical replication support for Postgres Changes;
- a configured Realtime replication slot;
- `PUBLICATIONS` including `supabase_realtime`;
- the Realtime service connected to the database;
- JWT settings aligned with Auth/PostgREST;
- the API gateway/reverse proxy forwarding WebSocket upgrade traffic;
- HTTPS/WSS externally in production.

`next.config.ts` derives `connect-src` from `NEXT_PUBLIC_SUPABASE_URL` and adds
both the HTTP(S) origin and WS(S) origin. This should work for a future
self-hosted API host as long as `NEXT_PUBLIC_SUPABASE_URL` is the browser-visible
gateway origin, for example `https://api.example.com`, and the gateway exposes
Realtime through that origin. Public Storage image optimization patterns are
also derived from this URL, but only for `https:` URLs.

## Auth Bootstrap Requirements

Charlal uses Supabase Auth for signup, login, logout, email confirmation, PKCE
callback exchange, and SSR cookie/session refresh.

Supabase self-hosting must provide:

- Auth service and initialized `auth` schema;
- `auth.users`, Auth migrations, and `auth.uid()`;
- configured JWT/signing secrets shared with API services;
- email/password signup enabled unless deliberately disabled for launch;
- `GOTRUE_SITE_URL`/`SITE_URL` set to the Charlal web origin;
- redirect allow-list entries for Charlal callback URLs, especially
  `https://<app-host>/auth/callback` and optionally
  `https://<app-host>/auth/confirm`;
- `API_EXTERNAL_URL` set to the public Auth API URL;
- SMTP/domain configuration for confirmation email delivery.

Password recovery remains intentionally deferred until final domain, SMTP, and
Auth email configuration are ready. No Auth redesign is required.

## Environment Variables

### Charlal Application Environment

| Variable | Visibility | Required | Purpose | Changes at cutover |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser-visible | Yes | Supabase gateway URL for browser/server clients, CSP `connect-src`, WSS origin, and public Storage image patterns. | Yes. Set from the Cloud project URL to the self-hosted public gateway URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-visible | Yes | Publishable API key passed to Supabase JS/SSR clients. | Yes. Use the self-hosted publishable key generated by the platform. |
| `NEXT_PUBLIC_SITE_URL` | Browser-visible | Required in production | Canonical Charlal web origin for auth callback redirects. | Only if the Charlal app hostname changes. This was present in `.env.example` and tests but undocumented in README before this runbook. |
| `NODE_ENV` | Server/build runtime | Yes for production semantics | Enables production callback-origin validation and disables dev diagnostics. | Normally set by the runtime/build platform, not manually as a secret. |

Charlal does not currently consume a server-only Supabase service-role key.
Do not expose `SUPABASE_SECRET_KEY`, `SERVICE_ROLE_KEY`, or database passwords
to the Next.js browser bundle.

### Self-Hosted Supabase Platform Values Charlal Depends On

| Variable/config | Visibility | Required | Purpose | Changes at cutover |
| --- | --- | --- | --- | --- |
| `SUPABASE_PUBLIC_URL` | Platform public config | Yes | Public gateway base URL used for API, Auth, Storage, and Realtime. | Yes. |
| `API_EXTERNAL_URL` | Platform public config | Yes | Public Auth API URL used in callback URLs. | Yes. |
| `SITE_URL` / `GOTRUE_SITE_URL` | Platform Auth config | Yes | Charlal web origin for default redirects and email links. | Set to production app origin. |
| Auth redirect allow-list / `GOTRUE_URI_ALLOW_LIST` | Platform Auth config | Yes | Allows Charlal callback destinations. | Set to production callback URLs. |
| `SUPABASE_PUBLISHABLE_KEY` | Platform credential | Yes | Value copied into Charlal's `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. | Yes. |
| `SUPABASE_SECRET_KEY` | Secret platform credential | Required by platform, not Charlal app | Server/admin platform key. | Yes, but do not put in Charlal env. |
| `POSTGRES_PASSWORD` | Secret platform credential | Yes | Database access for platform/admin/migrations. | Yes, but do not put in Charlal env. |
| JWT/Auth signing secrets | Secret platform credential | Yes | Auth, PostgREST, Realtime token verification. | Yes. |
| SMTP variables | Secret/platform config | Required for production confirmation email | Email confirmation delivery. | Yes. |
| Storage backend/volume config | Platform config | Yes | Durable object persistence. | Yes. |
| Realtime DB/publication/slot variables | Platform config/secrets | Yes | Postgres Changes transport. | Yes. |

## Migration-Sensitive Application Configuration

- Supabase browser and server clients use `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no Cloud project ref is hardcoded.
- `proxy.ts` refreshes SSR sessions via `@supabase/ssr` when Supabase env is
  present.
- `/auth/callback` exchanges PKCE `code` values with
  `supabase.auth.exchangeCodeForSession(code)` and redirects to
  `NEXT_PUBLIC_SITE_URL` in production.
- `next.config.ts` dynamically derives Supabase CSP origins from
  `NEXT_PUBLIC_SUPABASE_URL`.
- `next.config.ts` allows public optimized images from the Supabase host only
  when the configured Supabase URL is `https:`.
- The future production hostnames that must be allowed are the Charlal app host
  in Auth settings and the Supabase API/gateway host in Charlal env. If the API
  and Realtime hosts are split across different browser-visible origins, the
  current single-URL CSP derivation would need a future app change.

## Pre-Cutover Checklist

- Install and start the self-hosted Supabase stack.
- Configure strong platform secrets before first start.
- Configure `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL`, and `SITE_URL`.
- Configure production HTTPS for the Supabase gateway.
- Configure reverse-proxy WebSocket upgrades for Realtime.
- Configure durable Storage persistence.
- Configure production SMTP/domain settings for Auth confirmation email.
- Confirm all Supabase containers/services are healthy.
- Confirm Postgres, Auth, Storage, PostgREST, and Realtime platform schemas and
  roles are initialized.
- Run the SQL preflight checks below.
- Apply Charlal migrations in filename order.
- Configure Charlal app env: `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_SITE_URL`.
- Build/start the Next.js app with production runtime settings.
- Smoke test signup, email confirmation, login, logout, SSR session refresh,
  listing creation, listing image upload/display, avatar upload/display,
  message send/read receipts, message attachment signed URLs, favorites, review
  media upload/display, and Realtime updates over WSS.

## Non-Destructive Preflight Checks

Run these read-only SQL checks against the fresh self-hosted database before
applying Charlal migrations:

```sql
select current_database() as database_name, version() as postgres_version;

select to_regprocedure('gen_random_uuid()') as gen_random_uuid_function;

select nspname
from pg_namespace
where nspname in ('public', 'auth', 'storage');

select rolname
from pg_roles
where rolname in (
  'postgres',
  'anon',
  'authenticated',
  'service_role',
  'authenticator',
  'supabase_admin',
  'supabase_auth_admin',
  'supabase_storage_admin',
  'supabase_replication_admin'
)
order by rolname;

select to_regclass('auth.users') as auth_users,
       to_regprocedure('auth.uid()') as auth_uid;

select to_regclass('storage.buckets') as storage_buckets,
       to_regclass('storage.objects') as storage_objects,
       to_regprocedure('storage.foldername(text)') as storage_foldername,
       to_regprocedure('storage.extension(text)') as storage_extension;

select pubname
from pg_publication
where pubname = 'supabase_realtime';

select name, setting
from pg_settings
where name in ('wal_level', 'max_replication_slots', 'max_wal_senders');
```

Expected results:

- `gen_random_uuid_function` is non-null.
- `public`, `auth`, and `storage` schemas are present.
- Supabase API/platform roles are present.
- `auth.users` and `auth.uid()` are present.
- `storage.buckets`, `storage.objects`, `storage.foldername(text)`, and
  `storage.extension(text)` are present.
- `supabase_realtime` publication is present before Charlal migrations add
  tables.
- Replication settings are compatible with the Realtime service configuration.

Run these service checks before applying Charlal migrations:

```bash
curl -I https://<supabase-gateway-host>/auth/v1/health
curl -I https://<supabase-gateway-host>/rest/v1/
curl -I https://<supabase-gateway-host>/storage/v1/
```

For Realtime, verify WSS reaches the gateway path used by the Supabase stack:

```bash
websocat "wss://<supabase-gateway-host>/realtime/v1/websocket?apikey=<publishable-key>"
```

The Realtime protocol docs also show self-hosted Realtime may use
`/socket/websocket` when connecting directly to a Realtime server. Charlal
should use the public Supabase gateway URL through Supabase JS, not a separate
hardcoded Realtime URL.

After Charlal migrations run, verify project-owned results:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in (
  'listing-images',
  'profile-avatars',
  'message-attachments',
  'review-media'
)
order by id;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in (
    'messages',
    'conversation_reads',
    'conversation_user_state',
    'message_attachments'
  )
order by tablename;
```

## Migration Decision

Does Charlal currently need a new database migration solely to support
self-hosted Supabase?

No.

The only prerequisites found are Supabase platform bootstrap objects/services or
Charlal objects already created by existing project migrations. Adding a Charlal
migration for `gen_random_uuid()`, `auth`, `storage`, or `supabase_realtime`
would pollute project migrations with platform-owned setup and could conflict
with Supabase self-hosted initialization.
