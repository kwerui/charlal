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

## Before Changing Code

Required workflow: inspect -> understand -> identify root cause -> propose the smallest change -> edit -> verify.

- Read the relevant implementation end-to-end before modifying it.
- Search usages, related helpers, routes, tests, and migrations where relevant.
- Understand the actual runtime path before proposing a fix.
- Prefer one small root-cause fix over several speculative patches.
- Re-check assumptions after a failed attempted fix instead of stacking more guesses.
- Never assume unfamiliar or complicated code is accidental.
- Never delete or simplify code merely because its purpose is not immediately obvious.
- Check tests and product invariants before changing established workflows.

### Do not fix symptoms without finding the execution path

An account scroll-restoration bug survived several plausible fixes because the real cause was the Edit navigation missing `from=/account`. Trace navigation and data flow before patching secondary behavior.

### Do not resurrect already-fixed bugs

Old messaging Realtime, attachment-refresh, and initial-scroll issues are considered resolved. Do not carry historical bugs forward as active tasks unless current evidence shows they have returned.

### Do not invent architecture

Before creating a new helper, abstraction, hook, service, RPC, route, table, or state mechanism, search the existing repository first. Reuse a current understandable pattern when it fits, and do not create enterprise layers for theoretical cleanliness.

### Do not broaden security to fix access problems

Never solve RLS/access problems by giving broader table grants or replacing public-safe reads with owner-aware access. Trace the intended authorization path first.

### Keep domain states distinct

Never conflate user moderation (`normal`, `suspended`), listing moderation (`normal`, `hidden`), and listing lifecycle (`active`, `reserved`, `sold`, `archived`). A suspended user does not imply a "suspended listing", and suspension must not silently rewrite listing lifecycle or moderation state.

### Navigation/history code is high-risk

Do not simplify locale history, native Back behavior, scroll restoration, `from` parameters, or account readiness without tracing the complete workflow and relevant tests.

## Engineering Standard

Charlal should not merely "work". Changes must follow the current documented
conventions and supported patterns of the technologies used by the project.

KISS means choosing the simplest correct, secure, and idiomatic implementation,
not taking shortcuts around framework conventions, product requirements, security,
accessibility, typing, or maintainability.

Use this priority:

1. Correctness and security
2. Verified product requirements and invariants
3. Framework/platform conventions
4. Clarity and maintainability
5. Simplicity
6. Additional abstraction only when justified

Framework conventions are the default implementation standard, not authorization to
rewrite verified Charlal behavior. Unusual existing code may exist to satisfy a real
product or browser requirement. Understand and verify it before deciding it violates
a convention.

The goal is:
- never preserve genuinely bad code merely because it already works
- never rewrite unusual code merely because it looks unfamiliar
- first understand it, then judge it against current framework rules and Charlal's
  actual requirements

### Follow the framework, not assumptions

Before making framework-specific changes:

- Inspect the installed package/version.
- Inspect how the repository currently uses that framework.
- Consult the matching official/framework documentation when behavior is uncertain.
- Do not rely on patterns remembered from older Next.js, React, Supabase, or TypeScript versions.
- Heed deprecation warnings.
- Do not reproduce outdated examples simply because they are common online.

For Next.js-specific behavior, use the documentation matching the installed Next.js version, including `node_modules/next/dist/docs/` when dependencies are installed.

Finding a newer or more conventional pattern is not by itself a reason to rewrite
working code. If existing code genuinely violates a current supported convention,
identify the concrete problem and prefer the smallest safe correction.

### Next.js / React

Follow current App Router conventions. Prefer the appropriate server/client boundary instead of making components client components unnecessarily.

Do not:

- Add `"use client"` simply to make something easier.
- Move server-only data/security logic into the browser.
- Duplicate server and client state without need.
- Bypass Next.js routing/data conventions with ad-hoc browser code unless the existing product invariant genuinely requires it.
- Introduce hydration-sensitive formatting.
- Use deprecated framework APIs when a current supported pattern exists.

Existing navigation/history code may intentionally use browser APIs; inspect it before assuming it violates this rule.

### TypeScript

Keep the project genuinely typed. Do not use `any` as an escape hatch without a concrete reason, silence type errors instead of fixing their cause, add unsafe casts merely to make compilation pass, duplicate types unnecessarily, or weaken TypeScript configuration to accommodate new code.

Prefer narrow, explicit types at boundaries such as database results, RPC responses, route parameters, form data, and external input.

### Supabase / PostgreSQL

Use Supabase and PostgreSQL according to their intended security model.

- Treat RLS/database authorization as a real security boundary.
- Prefer narrow RPCs for privileged operations when that matches the current design.
- Keep public, authenticated-owner, and admin data-access paths distinct.
- Preserve explicit grants/revokes and hardened `SECURITY DEFINER` functions.
- Keep private data in appropriate private schemas/buckets.
- Do not move authorization into UI checks when it belongs in the database.
- Do not use service-level credentials in browser code.
- Do not expose sensitive helpers merely to simplify frontend implementation.

### Database design

Database changes must be intentional. Before adding a table, column, RPC, trigger, index, or policy, inspect the existing schema and migration history, determine whether the capability already exists, understand the ownership/security model, consider constraints and indexes where relevant, use a new migration, and test the security behavior, not only the happy path.

Do not add database structures merely because they make frontend code easier.

### Security

Never trade security for convenience. Pay attention to authentication, authorization, RLS, input validation, redirect/return URL safety, Storage visibility, signed/private media access, privilege escalation, owner/admin boundaries, and information leakage.

A UI control being hidden is never sufficient authorization by itself.

### Accessibility and HTML semantics

New UI should follow normal web accessibility and semantic HTML practices. Where relevant, use semantic elements, real buttons/links for interactive behavior, keyboard usability, meaningful labels, useful image alt text, associated form fields and labels, and preserved focus behavior.

Do not add unnecessary ARIA where native HTML already provides the correct semantics.

### CSS / responsive behavior

Follow the project's existing styling approach. Do not introduce a new styling framework for convenience, use JavaScript for layout behavior that CSS should handle, add arbitrary one-off styles without checking existing reusable patterns, or break responsive behavior while fixing one viewport.

### Validation and errors

Validate data at the appropriate trust boundary. Do not rely exclusively on browser validation for security-sensitive input.

Errors should map to the real failure where possible, avoid misleading users, and avoid leaking sensitive implementation information. Do not convert every error into a generic success/failure state simply to simplify code.

### Testing

Tests are not obstacles to work around. When behavior changes, understand existing tests before changing them, update tests when the intended behavior genuinely changes, add regression coverage for meaningful bugs where practical, and never weaken/delete a guardrail test merely because new code fails it.

A passing build alone is not sufficient verification.

### Dependency discipline

Do not add a package merely to avoid writing a small amount of straightforward code. Before adding a dependency, check whether the platform/framework already provides the capability, check whether the repository already has an equivalent, and justify the maintenance/security cost.

Do not upgrade dependencies opportunistically during unrelated work.

### No "vibe fixes"

Do not make speculative code changes just because they look plausible. Avoid arbitrary timeouts, unnecessary retries, forced refreshes, `window.location.reload()` as a substitute for fixing state/data flow, disabling lint/type/security checks, broad permission changes, duplicated state as a workaround, giant rewrites for small bugs, and unexplained magic constants.

If a workaround is genuinely necessary, document why the normal solution cannot be used and keep its scope narrow.

### Definition of done

A change is done only when it is correct for the requested behavior, consistent with current project architecture, compatible with product invariants, secure at the real trust boundary, idiomatic for the current framework versions, reasonably typed, understandable, and verified.

"Works on my screen" is not enough.

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

For project direction, see `docs/roadmap.md`. The roadmap is context, not permission to implement future features.

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
