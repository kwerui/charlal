# Project Roadmap

Roadmap items are not authorization to implement them. Work on a roadmap item only when it is explicitly selected by the user.

This is a planning document, not an implementation specification. Product and workflow behavior that must not regress lives in [Product invariants]
(product-invariants.md).

## Current Execution Order

Work should proceed in this order unless the roadmap is explicitly changed:

1. Finish repository and codebase hardening.
2. Authentication correctness and Russian provider expansion.
3. Multiple-buyer / completed-sale workflow.
4. Message reporting and moderation.
5. Decide whether minimal external email notifications are needed.
6. Finish localization, legal/compliance, and launch readiness.
7. Pre-launch engineering and admin operational readiness.
8. Soft Launch.
9. Public Launch.
10. Post-launch improvements driven by real usage.

Roadmap order is planning context, not authorization to implement the next item
automatically. Complete and verify the currently selected phase before moving on.

## Completed foundation

- Bilingual Tuvan/Russian marketplace foundation.
- Listings, search, categories, and listing detail flows.
- Accounts, seller profiles, and owner listing management.
- Favorites and saved-listing behavior.
- Buyer-seller messaging with private attachments.
- Current Realtime behavior for messaging and notifications.
- Seller reviews using stars plus predefined tags.
- Primary in-app notifications.
- Listing reports and listing moderation.
- User suspension and admin moderation.
- Repository safety documentation.
- Recruiter-facing README.
- Local development documentation.

### Hardening exit criteria

Repository/codebase hardening is complete when:

- [ ] Repository structure is understandable and no known dependency-direction problem remains.
- [ ] Confirmed dead/demo repository code has been removed.
- [ ] Critical Supabase authorization boundaries have executable local integration coverage.
- [ ] Existing static/unit regression suite passes.
- [ ] Lint passes.
- [ ] Production build passes.
- [ ] GitHub CI passes.
- [ ] No unexplained framework/build warnings remain.
- [ ] No known Critical security or data-integrity issue remains.
- [ ] Documentation and roadmap reflect the current project.
- [ ] Working tree is clean.

Large files, cosmetic refactoring, CSS reorganization, and Low-priority cleanup are not blockers.

## Current repository hardening

- Continue repository hygiene where the benefit is verified.
- Resolve the Turbopack/workspace-root warning with the smallest correct change.
- Remove genuinely unused default artifacts only when verified.
- Add simple CI.
- Add remaining documentation only where it has clear value.
- Consider later surgical readability improvements where demonstrated pain justifies them.
- Finish useful GitHub repository metadata and presentation cleanup.

Broad source-tree refactoring for its own sake is not a goal.

## Pre-launch product work

### Authentication expansion

Research and, if selected, implement suitable Russian authentication providers:

- Yandex
- VK
- Mail.ru

Self-hosted Supabase compatibility, OAuth/OIDC behavior, account linking, and operational implications must be researched before implementation.

### Multiple-buyer / completed-sale UX

Improve how a seller identifies the actual buyer/completed sale when multiple interested buyers exist.

Charlal still does not process payment.

### Message reporting/moderation

Add reporting/moderation because messages can contain arbitrary text and images.

Do not add constrained-review reporting unless there is a demonstrated need.

### External notifications

In-app notifications remain primary.

Browser push is not currently desired.

Minimal email notifications, especially for a new message, may be considered only after consent/compliance/privacy review. Email notifications are not committed.

### Localization and legal readiness

- Finish remaining verified translations/review markers.
- Prepare privacy/personal-data documentation.
- Research Russian compliance requirements.
- Add appropriate contact/legal information.
- Define operational moderation/admin procedures.

Do not treat this roadmap as legal advice or write legal conclusions into it.

### Launch readiness

- Final regression testing.
- Security review.
- Production configuration review.
- Backup/recovery considerations.
- Moderation/admin operational readiness.
- Critical browser/mobile smoke testing.
- No known critical data-loss/security blockers.
- Confirm production logging/error visibility is sufficient to diagnose failures without exposing sensitive data.
- Review important Next.js, React, TypeScript, Supabase, and PostgreSQL patterns
  against the currently installed/supported versions; fix concrete convention
  violations without performing broad modernization for its own sake.
- Review public metadata, indexing, and basic SEO behavior before Public Launch.

### Engineering quality gate

Before Soft Launch or Public Launch:

- No known critical security or authorization flaws.
- No known data-loss bugs.
- Current framework deprecations reviewed.
- Lint/tests/build clean.
- Important workflows smoke-tested.
- RLS/RPC/Storage boundaries reviewed.
- Authentication/redirect behavior reviewed.
- Responsive behavior checked on representative mobile/desktop sizes.
- Accessibility basics checked on important flows.
- Production configuration reviewed.
- No knowingly temporary "vibe fixes" on critical paths.

## Soft Launch

Soft Launch is a controlled real-user release. It has not happened yet.

Likely goals:

- Make the frontend reachable intentionally.
- Use a limited/invited initial audience.
- Verify production auth, listings, images, messaging, reviews, notifications, and moderation with real usage.
- Monitor errors and operational issues.
- Verify reporting/admin workflows.
- Establish support/contact process.
- Collect UX feedback.
- Fix launch-blocking issues before broad promotion.
- Define how invited users can report bugs or request help.

## Public Launch

Potential readiness:

- General public frontend availability.
- Finalized legal/privacy/contact surfaces.
- Production operational checks completed.
- Moderation/report handling ready.
- Backups/recovery understood.
- Launch regression/smoke testing complete.
- No known critical security or data-loss issues.
- README/GitHub live link may then be enabled.
- Broader promotion can begin.

## Post-launch

- Prioritize actual user feedback.
- Improve moderation based on real abuse patterns.
- Improve buyer/seller workflow based on real usage.
- Tune notifications.
- Continue accessibility/performance improvements.
- Make selective maintainability refactors where demonstrated pain exists.

## Out-of-scope / Non-goals

- No in-site checkout.
- No payment processing.
- No escrow.
- No browser push currently planned.
- No enterprise architecture rewrite.
- No free-text/photo seller reviews.
- No implementation of roadmap items without explicit approval.
