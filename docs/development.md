# Local Development

This guide is for running Charlal on your own machine. It does not cover
production deployments, VPS access, Caddy changes, production database URLs, or
production migrations.

For project safety rules and workflow invariants, read:

- [AGENTS.md](../AGENTS.md)
- [Product invariants](product-invariants.md)

## Prerequisites

Install only the tools needed for the local workflow:

- Node.js compatible with the repository's Next.js version.
- npm. The repository uses `package-lock.json` and pins npm with the
  `packageManager` field in `package.json`.
- Supabase CLI. The current local CLI is `2.116.0`.
- Docker, because the Supabase CLI local stack runs its services in containers.

## Install Dependencies

For normal local development, install dependencies with:

```bash
npm install
```

This updates `node_modules` and may update `package-lock.json` if dependency
requirements change.

For a clean reproducible install, such as CI or checking a fresh clone, use:

```bash
npm ci
```

`npm ci` installs exactly what is in `package-lock.json` and removes any
existing `node_modules` first.

## Environment Variables

Copy the committed template:

```bash
cp .env.example .env.local
```

Fill in the variable names from `.env.example`:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
```

Use local Supabase values for local development. Do not copy production
credentials or production URLs into local documentation, commits, screenshots,
logs, or shared messages.

With the default local Supabase ports, `NEXT_PUBLIC_SUPABASE_URL` is usually:

```text
http://127.0.0.1:54321
```

`NEXT_PUBLIC_SITE_URL` should normally be:

```text
http://localhost:3000
```

Get the local publishable key from the Supabase CLI output after starting the
stack.

Restart the Next.js development server after changing `.env.local`.

## Local Supabase

Start Docker, then start the local Supabase stack:

```bash
supabase start
```

The local stack provides the development database, Auth, Storage, Realtime,
Studio, and local email testing services configured by `supabase/config.toml`.

Useful local commands:

```bash
supabase status
supabase stop
```

Keep this workflow local. Do not run production database, deployment, VPS, SSH,
or Caddy commands from this guide.

## Database Migrations

Database migrations live in:

```text
supabase/migrations/
```

Applied migrations must not be edited. If a database behavior changes, add a
new migration instead.

To rebuild the local database from the migration history, run:

```bash
supabase db reset
```

Warning: `supabase db reset` destroys local database data, including local
users, Auth state, listings, messages, Storage metadata, reviews, notifications,
and moderation history. Use it only when you are ready to recreate local test
data.

Do not enumerate migrations manually in setup documentation; the filenames in
`supabase/migrations/` are the source of truth.

## Running the App

Start the Next.js development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

The standard verification sequence for repository changes is:

```bash
npm run lint
npm test
npm run build
git diff --check
```

Phase 2J-A recorded a checkpoint of 146 passing automated tests. Treat that as
a checkpoint, not a permanent ceiling; the count can increase as coverage is
added.

## Useful Notes

- Tuvan (`tyv`) is the default locale and uses unprefixed URLs.
- Russian (`ru`) uses `/ru`.
- Never invent Tuvan text. Use `[TYV REVIEW]` when verified Tuvan is unavailable.
- Public marketplace reads and authenticated owner-aware reads are intentionally
  different. Do not merge them casually.
- Message attachments are private; listing and profile images are public media
  with different Storage rules.
- Charlal is a classifieds marketplace, not an in-site payment, checkout, or
  escrow system.

## Production Separation

This document is local-only.

Do not add production credentials, SSH tunnel instructions, production database
URLs, production migration commands, Caddy changes, or deployment steps here.
Production operations are separate and must be explicitly requested.
