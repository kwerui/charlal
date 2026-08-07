This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Supabase Setup

This repository uses Supabase authentication, profiles, PostgreSQL-backed
user-created advertisements, and private seller/buyer messaging. Built-in demo
listings still live in source code. Images, favourites, Realtime delivery,
unread badges, attachments, and notifications are not implemented yet.

1. Create a Supabase project from the Supabase dashboard.
2. Open the project, then use the Connect dialog or Project Settings API section
   to find the Project URL and Publishable key.
3. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

Do not commit `.env.local`; it is ignored by Git. `.env.example` contains only
empty placeholders for the required variable names.

Restart the development server after editing environment variables so Next.js
loads the new values.

To verify local setup during development, call
`verifySupabaseClientsForDevelopment()` from `src/lib/supabase/verify.ts` in a
temporary local-only check. It returns only success/failure metadata and never
returns the project URL, keys, cookies, access tokens, or user data. Remove any
temporary check before production.

Until both public Supabase variables are present, the root `proxy.ts` leaves
application requests unchanged so local development can still load the app.

### Apply the SQL Migrations

The SQL migrations are stored in `supabase/migrations/`. The project does not
require the Supabase CLI; you can apply the files manually in the dashboard SQL
Editor.

1. Open `supabase/migrations/20260806_create_profiles.sql`.
2. Copy the full SQL into the Supabase dashboard SQL Editor.
3. Run the SQL.
4. In Table Editor, confirm `public.profiles` exists with `id`, `display_name`,
   `created_at`, and `updated_at`.
5. Confirm RLS is enabled on `public.profiles`.
6. In Authentication users, create or confirm a test user and verify a matching
   row appears in `public.profiles`.
7. Open `supabase/migrations/20260807_create_listings.sql`.
8. Copy the full SQL into the SQL Editor and run it after the profiles SQL.
9. Confirm `public.listings` exists and RLS is enabled.
10. Confirm policies exist for public reads and owner-only insert/update/delete.
11. Open `supabase/migrations/20260808_create_messaging.sql`.
12. Copy the full SQL into the SQL Editor and run it after the listings SQL.
13. Open `supabase/migrations/20260809_fix_messaging_inbox_and_unread.sql`.
14. Copy the full SQL into the SQL Editor and run it after the messaging SQL.
15. Confirm `public.conversations`, `public.messages`, and
    `public.conversation_reads` exist.
16. Confirm RLS is enabled on all messaging tables.
17. In Database > Policies, inspect the conversation and message policies:
    participants can select their conversations/messages, authenticated
    participants can insert messages, and anonymous users have no messaging
    access.

The listings migration creates the `public.listings` table, constraints, owner
policies, indexes for owner/category/date reads, and triggers that keep seller
display names in sync with `public.profiles`.

The messaging migration creates `public.conversations`, `public.messages`,
participant-only RLS, minimal grants, message timestamp triggers, a controlled
`public.start_listing_conversation()` function. The follow-up messaging repair
migration adds durable read state in `public.conversation_reads`, fixes
`public.list_conversation_summaries()` for the inbox, adds
`public.count_unread_conversations()` for the header badge, and adds
`public.mark_conversation_read()` for clearing unread state when a thread is
opened. Conversation rows store listing-title and display-name snapshots. If a
listing is deleted, `listing_id` is set to `null`, but the conversation and
messages remain available to the buyer and seller with the original listing
title snapshot.

When a profile display name changes, the profile synchronization trigger updates
listing seller names and conversation buyer/seller display-name snapshots. Email
addresses are not copied into listings, conversations, or messages.

To test messaging, create two confirmed Supabase accounts. Sign in as one user
and create an advertisement, then sign in as the second user, open that database
listing, and use Contact seller. The first message creates or reuses a single
buyer/listing conversation and redirects to the thread. Both users can open
Account > Messages or the header Messages link to view the inbox. During this
phase, the sender sees new messages immediately; the recipient should refresh,
navigate, or revisit Messages to see replies and unread badge changes. Supabase
Realtime live delivery, push/email notifications, read receipts, attachments,
and typing indicators are planned for a later phase.

### Advertisement Storage

New advertisements are written to `public.listings` through Supabase RLS. The
database assigns ownership from the authenticated Supabase user via `auth.uid()`
and derives the public seller display name from `public.profiles`; the browser
form never submits an owner ID or seller email.

The app still reads old browser-local advertisements from
`tuva-marketplace:user-listings:v1` only for migration and recovery:

- After sign-in, eligible local advertisements owned by the current Supabase UUID
  or by the exact matching legacy demo user ID are imported once into
  `public.listings`.
- A local advertisement is removed from browser storage only after its database
  insert succeeds.
- Older unassigned local advertisements remain visible in Account until the
  signed-in user explicitly claims one; claiming inserts it into PostgreSQL and
  then removes only that local copy.
- Failed imports remain in browser storage and can be retried later.

The import completion marker is browser-local and idempotent:
`charlal:supabase-listing-imports:v1`.

### Configure Auth URLs

In the Supabase dashboard, open Authentication, then URL Configuration.

Set the Site URL for local development:

```text
http://localhost:3000
```

Add redirect URLs:

```text
http://localhost:3000/**
http://localhost:3001/**
```

The `localhost:3001` value is optional, but useful when testing a local
production server on another port.

### Default Confirmation Email

Confirm the Email provider is enabled in Authentication providers.

New Free Supabase projects that use Supabase's default SMTP may not allow Auth
email template editing. This app supports that locked default template by using
the standard PKCE confirmation flow.

During sign-up, the app sends Supabase an `emailRedirectTo` URL like
`/auth/callback?next=/account`. The unchanged Supabase confirmation email first
confirms the address through Supabase, then redirects back to `/auth/callback`
with a short-lived `code`. The callback route exchanges that code with
`supabase.auth.exchangeCodeForSession(code)`, stores the session in cookies, and
redirects to the safe internal `next` destination.

Custom SMTP can be configured later if you want branded editable templates. The
older token-hash `/auth/confirm` pattern is retained only as optional
compatibility for a future custom template that can send `token_hash` links; it
is not used by the default locked template flow.

Supabase development email delivery can be rate-limited. Test both with email
confirmation enabled and disabled:

- With confirmation enabled, registration should show "Check your email" and not
  treat the user as signed in until confirmation succeeds.
- With confirmation disabled, registration may create a session immediately and
  continue to the safe internal `next` destination.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
