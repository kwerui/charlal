# Charlal Marketplace

Charlal is a bilingual classifieds marketplace for Tuva. Users can post local advertisements, browse and filter listings, save items, contact sellers, and build seller reputation through verified review workflows.

Charlal is intentionally a **classifieds platform rather than an in-site checkout system**. Buyers and sellers arrange payment directly outside the platform; completed-sale records are used internally for marketplace features such as verified seller reviews.

## Screenshots

<img
  width="1512"
  height="870"
  alt="Charlal marketplace interface"
  src="https://github.com/user-attachments/assets/ff58922b-1c7f-4a55-99bf-4c4ed7305bbe"
/>

### Homepage

<img
  width="1512"
  height="864"
  alt="Charlal homepage"
  src="https://github.com/user-attachments/assets/c65f08c5-6562-44e6-b7b9-1d6205b72456"
/>

### Listing Page

<img
  width="1510"
  height="869"
  alt="Charlal listing detail page"
  src="https://github.com/user-attachments/assets/c2bc1bcb-1200-4480-89ed-1e6ef73a3d67"
/>

## Features

### Marketplace

- Create, edit, manage, and archive classifieds listings
- Upload and manage listing photos
- Browse categories and subcategories
- Search and filter marketplace results
- View detailed listing pages and public seller profiles
- Save listings to a personal favorites area

### Messaging

- Start buyer–seller conversations from listings
- Realtime message updates
- Read and unread conversation state
- Private message attachments
- Conversation history preserved across listing and moderation changes

### Reputation & Notifications

- Seller ratings with predefined review tags
- Review eligibility based on completed-sale records
- In-app notifications for new messages and reviews
- Saved-listing notifications when availability meaningfully changes

### Safety & Moderation

- User-submitted listing reports
- Admin listing moderation
- User suspension with preserved account and history access
- Moderation audit history
- Separate listing lifecycle, listing moderation, and user moderation states

## Engineering Highlights

### Tuvan and Russian Localization

Charlal supports two application locales:

- **Tuvan (`tyv`)** — default locale with unprefixed URLs
- **Russian (`ru`)** — available under `/ru`

Locale-aware routing is preserved across authentication, listings, search, categories, account pages, and browser navigation.

Tuvan also introduces an unusual technical constraint: runtime support for `Intl('tyv')` is not reliable across environments. Charlal therefore uses deterministic date-formatting helpers rather than depending on browser-specific locale support.

### Public vs Owner-Aware Data Access

Public marketplace pages and authenticated account pages intentionally use different data-access paths.

Public listing loaders use a cookie-free Supabase client, while account and owner-history flows use authenticated owner-aware access.

This prevents an authenticated owner's broader database permissions from accidentally exposing listings that should not appear on public marketplace surfaces, including hidden, sold, archived, or otherwise unavailable listings.

### Database Security

The Supabase/PostgreSQL layer uses:

- Row Level Security (RLS)
- Narrow RPC entry points
- Hardened `SECURITY DEFINER` functions
- Explicit grants and revokes
- Private-schema helpers for sensitive authorization logic
- Storage policies for uploaded media

Sensitive authorization is enforced at the database boundary rather than relying only on frontend controls.

### Realtime Messaging & Private Attachments

Messaging uses Supabase Realtime to keep active conversations current without requiring manual refreshes.

Message attachments are stored separately from public marketplace media in a **private Storage bucket** and accessed only through authorized conversation flows.

### Non-Destructive Moderation

Charlal keeps several concepts deliberately separate:

- listing lifecycle: `active`, `reserved`, `sold`, `archived`
- listing moderation: `normal`, `hidden`
- user moderation: `normal`, `suspended`

For example, suspending a seller does not rewrite or delete their listings. Public visibility changes while the underlying listing and account history remain preserved.

### Browser Navigation & Scroll Restoration

Marketplace browsing keeps native browser behavior wherever possible.

Charlal preserves result-page position when users open a listing and return, and also restores the previous position in **My Listings** after editing or cancelling an edit.

This requires coordination between locale-aware URLs, browser history, asynchronous account loading, and scroll-restoration state.

## Tech Stack

- **Next.js 16.3.1** — App Router
- **React 19.2.4**
- **TypeScript**
- **next-intl**
- **Supabase**
  - PostgreSQL
  - Auth
  - Storage
  - Realtime
  - Row Level Security
- **Supabase JS / SSR**
- **CSS**
- **ESLint**
- **Node.js test runner**
- Self-hosted Supabase production architecture

## Architecture

```text
Browser
   │
   ▼
Next.js App Router
   │
   ├── Public marketplace reads
   ├── Authenticated account flows
   └── Server actions / application logic
   │
   ▼
Supabase
   ├── PostgreSQL + RLS
   ├── Auth
   ├── Storage
   ├── Realtime
   └── RPC / SECURITY DEFINER functions
```

The application deliberately keeps public marketplace access separate from authenticated owner/admin workflows while allowing PostgreSQL policies and RPCs to enforce sensitive permissions close to the data.

## Testing

At the current repository checkpoint:

**146 automated tests pass.**

The suite includes regression and guardrail coverage for areas such as:

- authentication validation and callback safety
- locale-aware routing
- deterministic date formatting
- listing visibility
- public vs owner-aware reads
- favorites
- messaging behavior
- Realtime diagnostics
- private attachments
- seller reviews
- notifications
- listing moderation
- user suspension
- security-sensitive database migrations
- navigation and scroll-restoration invariants

The standard verification sequence for code changes is:

```bash
npm run lint
npm test
npm run build
git diff --check
```

## Local Development

Install dependencies:

```bash
npm install
```

Configure the application with a local Supabase environment using:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
```

Then start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

A local Supabase stack is used during development so authentication, database policies, Storage, Realtime, and migrations can be tested without depending on production infrastructure.

## Project Status

Charlal is in active development.

Implemented core systems include:

- authentication and profiles
- listings, search, categories, and filters
- favorites
- buyer–seller messaging
- private attachments
- Realtime updates
- seller reviews
- in-app notifications
- listing reporting and moderation
- user suspension and admin moderation
- Tuvan/Russian localization
- self-hosted Supabase infrastructure

`charlal.ru` is the project/domain name. The backend infrastructure is production-facing, while the frontend is intentionally **not presented as a public live demo yet**.

Current future areas include authentication-provider expansion, multiple-buyer/completed-sale UX improvements, message reporting/moderation, legal and privacy finalization, and eventual public frontend launch.

## Project Documentation

For implementation safety and behavior-preservation rules:

- [`AGENTS.md`](AGENTS.md)
- [`docs/product-invariants.md`](docs/product-invariants.md)

