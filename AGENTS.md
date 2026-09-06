# Charlal Agent Guide

Charlal is a classifieds marketplace. Protect existing user workflows first; keep changes small, boring, and easy to review.

## Core Working Rules

- Inspect the relevant files and current behavior before editing.
- Prefer KISS over clever abstractions.
- Preserve existing behavior unless the user explicitly asks to change it.
- Do not introduce abstractions without a concrete, repeated need.
- Avoid unrelated refactors, file moves, and cleanup churn.
- Make incremental changes that are easy to verify.
- After code changes, run the required verification commands.

## Next.js

This project may use a newer Next.js version than an agent expects. Before changing Next.js-specific behavior, inspect the installed version and, when dependencies are installed, consult the matching documentation under `node_modules/next/dist/docs/`. Pay attention to framework deprecation warnings rather than relying on older Next.js assumptions.

## Required Verification

For code changes, run:

- `npm run lint`
- `npm test`
- `npm run build`
- `git diff --check`

Phase 2J-A checkpoint: 146 passing tests. The expected count may increase as tests are added; existing tests must not regress.

## Translation Rules

- `tyv` is Tuvan and is the default, unprefixed locale.
- `ru` is Russian and is prefixed with `/ru`.
- NEVER invent Tuvan.
- If verified Tuvan is unavailable for new user-facing text, use `[TYV REVIEW]`.
- Do not silently substitute invented Tuvan.
- Unreviewed Russian may use `[RU REVIEW]`.
- Existing bilingual, English fallback, legal, privacy, contact, or review-marker text may intentionally remain; do not change it merely for cleanup.
- Do not use runtime `Intl('tyv')` date formatting. Use deterministic date helpers instead.

## Database, RLS, and Storage

- Never edit an already-applied migration; add a new migration for DB changes.
- Never fix RLS problems with broad grants.
- Preserve `SECURITY DEFINER` hardening and narrow grants.
- Derive acting identity from `auth.uid()` where appropriate.
- Do not expose private arbitrary-user helpers to browser roles.
- Do not casually alter Storage bucket visibility or policies.

## Public vs Owner-Aware Reads

Public listing loaders use the cookie-free/public Supabase client. Account and My Listings flows use authenticated owner-aware access. Owner visibility must never leak into public listing eligibility, and these paths must not be merged.

## Product and Behavior Invariants

- Listing lifecycle status and listing moderation state are separate; hidden listings are preserved.
- User moderation is `normal` or `suspended`; suspension does not disable Auth and must not mutate listing status or `moderation_state`.
- Suspended users keep read/history access, but marketplace mutations remain restricted.
- New messaging is blocked if either participant is suspended; existing message history remains readable.
- Admins cannot suspend themselves or other admins.
- Message attachments are private.
- Reviews are stars plus predefined tags only; no free text, photos, or seller response.
- In-app notifications are primary.
- Saved-listing notifications should only follow meaningful availability-boundary changes.
- Locale, native history, and scroll restoration behavior is intentionally non-trivial. Preserve result-page Back restoration, locale-normalized history, `/account -> Edit -> Save/Cancel -> prior position`, `from=/account`, `requestResultsScrollRestore('/account')`, `router.back()`, and account readiness before restoration.

For workflow-level detail, see `docs/product-invariants.md`.

## Product Decisions

- Charlal has no in-site payment processing, checkout, or escrow.
- Payment happens outside Charlal.
- Completed-sale metadata is internal marketplace/review functionality.
- Future VK/Yandex/Mail.ru auth is not implemented yet.
- Future message reporting is not implemented yet.
- Multiple-buyer UX remains future work.

## Production Safety

- The frontend is intentionally private and not publicly routed yet.
- The API is production-facing.
- `charlal.ru` may be referenced as the project/domain name, but do not advertise it as a live public demo while the frontend is private.
- Do not add a public `charlal.ru` Caddy frontend route.
- Do not deploy, migrate the production DB, modify VPS services/env, or expose the frontend unless explicitly instructed.
