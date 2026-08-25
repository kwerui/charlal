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
listings still live in source code. User-created database advertisements can
use public Supabase Storage listing photos. Message photos use a separate
private Supabase Storage bucket and short-lived signed URLs. Favourites,
push/email notifications, typing indicators, and moderation tools are not
implemented yet.

1. Create a Supabase project from the Supabase dashboard.
2. Open the project, then use the Connect dialog or Project Settings API section
   to find the Project URL and Publishable key.
3. Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Do not commit `.env.local`; it is ignored by Git. `.env.example` contains only
empty placeholders for the required variable names.

`NEXT_PUBLIC_SITE_URL` must be set to the canonical Charlal web origin in
production so Auth callback redirects use the public app URL instead of the
request origin.

Restart the development server after editing environment variables so Next.js
loads the new values.

To verify local setup during development, call
`verifySupabaseClientsForDevelopment()` from `src/lib/supabase/verify.ts` in a
temporary local-only check. It returns only success/failure metadata and never
returns the project URL, keys, cookies, access tokens, or user data. Remove any
temporary check before production.

Until both public Supabase variables are present, the root `proxy.ts` leaves
application requests unchanged so local development can still load the app.

For the self-hosted Supabase production cutover prerequisites, see
[`docs/self-hosted-supabase-precutover.md`](docs/self-hosted-supabase-precutover.md).

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
15. Open `supabase/migrations/20260810_enable_messaging_realtime_and_receipts.sql`.
16. Copy the full SQL into the SQL Editor and run it after the inbox/unread SQL.
17. Open `supabase/migrations/20260811_add_message_send_idempotency.sql`.
18. Copy the full SQL into the SQL Editor and run it after the Realtime SQL.
19. Open `supabase/migrations/20260812_fix_idempotent_message_send.sql`.
20. Copy the full SQL into the SQL Editor and run it after the idempotency SQL.
21. Confirm `public.conversations`, `public.messages`, and
    `public.conversation_reads` exist.
22. Confirm `public.messages.client_attempt_id` exists and the partial unique
    index on conversation, sender, and client attempt exists.
23. Confirm RLS is enabled on all messaging tables.
24. In Database > Policies, inspect the conversation and message policies:
    participants can select their conversations/messages, authenticated
    participants can insert messages, and anonymous users have no messaging
    access.
25. In Database > Replication, confirm `public.messages` and
    `public.conversation_reads` are included in the `supabase_realtime`
    publication.
26. Open `supabase/migrations/20260817_add_listing_images.sql`.
27. Copy the full SQL into the SQL Editor and run it after the message
    management SQL.
28. Confirm the `listing-images` Storage bucket exists, is public, has a 5 MB
    file-size limit, and allows only `image/jpeg`, `image/png`, and
    `image/webp`.
29. Confirm `public.listing_images` exists and RLS is enabled.
30. In Database > Policies, inspect the `listing_images` and `storage.objects`
    policies: anonymous visitors can view public listing-image metadata/media,
    while only authenticated listing owners can insert/reorder/delete metadata
    and upload/delete matching Storage objects.
31. Open `supabase/migrations/20260822_add_message_attachments.sql`.
32. Copy the full SQL into the SQL Editor and run it after the messaging public
    profile data migration.
33. Confirm the `message-attachments` Storage bucket exists, is private, has an
    8 MB file-size limit, and allows only `image/jpeg`, `image/png`, and
    `image/webp`.
34. Confirm `public.message_attachments` exists and RLS is enabled.
35. In Database > Policies, inspect the `message_attachments` and
    `storage.objects` policies: only authenticated conversation participants
    can read attachment metadata or upload into a conversation path, and only
    the uploading owner can delete the private Storage object.

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
opened. The Phase 4B Realtime migration adds `public.messages` and
`public.conversation_reads` to the Supabase Realtime publication and allows
conversation participants to select both participants' read markers, so senders
can see whether their newest outgoing message is Sent or Read. The follow-up
idempotency migration adds nullable `client_attempt_id` values to messages and
a controlled `public.send_conversation_message()` function so retrying the same
uncertain send attempt reuses the existing message instead of inserting a
duplicate row. Conversation rows store listing-title and display-name snapshots.
If a listing is deleted, `listing_id` is set to `null`, but the conversation and
messages remain available to the buyer and seller with the original listing
title snapshot.

The listing-images migration creates the public `listing-images` bucket and the
`public.listing_images` metadata table. Image files are stored in Supabase
Storage under `<listing-id>/<random-file-id>.<extension>`, while PostgreSQL
stores only the Storage path and display position. The bucket is
public because listing photos are public marketplace media; do not use it for
private messages, documents, account-only data, or anything that requires signed
URLs. Anonymous visitors may view listing images, but anonymous users cannot
upload, update, or delete Storage objects or image metadata. Owner authorization
is still enforced through `auth.uid()` and `public.listings.owner_id`.

### Message Photo Attachments

Message photos are private conversation media. Do not store them in the public
`listing-images` or `profile-avatars` buckets. The migration
`20260822_add_message_attachments.sql` creates the private
`message-attachments` bucket, `public.message_attachments`, participant-only
metadata RLS, private Storage policies, attachment-aware send/edit/delete RPCs,
and an inbox-summary update for image-only latest-message previews.

Storage paths use:

```text
<conversation-id>/<client-attempt-id>/<random-file-id>.<ext>
```

The path does not contain the sender's email, user ID, or original filename.
The database stores only metadata and Storage paths. The app generates
short-lived signed URLs after verifying that the current user participates in
the conversation. Signed URLs are not persisted; possession of one grants
temporary access until it expires.

Message sending supports text-only, photo-only, and text plus up to four
photos. JPEG, PNG, and WebP are allowed, with an 8 MB limit per photo. Photos
upload first into the private bucket under the stable `client_attempt_id`
attempt folder, then the server RPC creates the message and metadata
atomically. If upload fails before the RPC, already-uploaded objects are removed
best-effort and the draft remains. If the RPC response is uncertain, the app
keeps the same attempt ID and uploaded paths so retrying the same attempt does
not create another message row.

Realtime still uses the existing messaging subscriptions. When a message event
arrives, the thread fetches an authorized snapshot to obtain attachment
metadata and fresh signed URLs. Message photos are visible only to the buyer
and seller; a signed-out visitor or unrelated user cannot read metadata, upload
into the conversation path, or retrieve the private object through Storage RLS.

Deleting a message tombstones it for both participants, removes attachment
metadata, and best-effort deletes sender-owned Storage objects. Hiding a
conversation for one user does not delete shared messages or attachments.

When a profile display name changes, the profile synchronization trigger updates
listing seller names and conversation buyer/seller display-name snapshots. Email
addresses are not copied into listings, conversations, or messages.

To test messaging, create two confirmed Supabase accounts. Sign in as one user
and create an advertisement, then sign in as the second user, open that database
listing, and use Contact seller. The first message creates or reuses a single
buyer/listing conversation and redirects to the thread. Both users can open
Account > Messages or the header Messages link to view the inbox. During this
phase, Supabase Realtime updates the active thread, header unread badge, and
Messages inbox after database message/read-marker changes. Sender-visible read
receipts are shown only for the sender's newest outgoing message. If the live
connection is unavailable, refresh the thread or inbox to check for messages.
Push/email notifications, typing indicators, and moderation tools are planned
for later phases.

### Advertisement Storage

New advertisements are written to `public.listings` through Supabase RLS. The
database assigns ownership from the authenticated Supabase user via `auth.uid()`
and derives the public seller display name from `public.profiles`; the browser
form never submits an owner ID or seller email.

Listing photos are uploaded only after the advertisement row exists. The app
supports zero to eight JPEG, PNG, or WebP photos per database listing, with the
first image used as the cover in cards and the full ordered gallery shown on
detail pages. If a listing is created but photo upload fails, the listing is
kept and the owner can open Edit advertisement to retry adding photos. Demo
source-code listings keep their existing static images and are not migrated to
Storage.

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
