# Product Invariants

This document maps the Charlal workflows that must survive refactors. Keep it compact, update it when behavior changes, and prefer preserving working flows over simplifying unfamiliar infrastructure.

## Authentication

Purpose: Let users sign in, sign up, confirm auth links, recover access, and return safely to the intended page.

Routes: `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/callback`, `/auth/confirm`, protected `/account/*` routes.

Key files: `src/app/[locale]/sign-in/page.tsx`, `src/app/[locale]/sign-up/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts`, `src/lib/auth/*`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`.

Data/security dependencies: Supabase Auth, auth cookies, `safeNextPath`, callback-origin handling.

Preserve: Protected pages redirect through localized sign-in paths. Auth callbacks must not allow unsafe return URLs. User suspension restricts marketplace mutations but does not disable Auth or read/history access.

Tests: `tests/authValidation.test.ts`, `tests/authCallbackOrigin.test.ts`, `tests/i18nRouting.test.ts`.

## Locale Switching and History

Purpose: Keep Tuvan as the default route shape while supporting Russian routes and predictable browser navigation.

Routes: unprefixed `tyv` routes, prefixed `/ru` routes, all localized account/listing/search/category pages.

Key files: `src/i18n/routing.ts`, `src/i18n/navigation.ts`, `src/i18n/localePath.ts`, `src/i18n/localeHistory.ts`, `src/proxy.ts`, `src/lib/resultsScrollStorage.ts`, `src/app/[locale]/account/AccountNativeHistoryRestorer.tsx`, `src/instrumentation-client.ts`.

Data/security dependencies: Locale-aware routing helpers and deterministic date formatting helpers.

Preserve: `tyv` is default/unprefixed; `ru` is prefixed. Do not use runtime `Intl('tyv')` date formatting. Locale-normalized history and native Back restoration are intentional and should not be casually simplified.

Tests: `tests/i18nRouting.test.ts`, `tests/messageDateFormatting.test.ts`, `tests/reviewDateFormatting.test.ts`.

## Listing Creation and Editing

Purpose: Let authenticated users create and maintain their own classifieds listings.

Routes: `/post-ad`, `/account/listings/[id]/edit`.

Key files: `src/app/[locale]/post-ad/PostAdForm.tsx`, `src/app/components/ListingForm.tsx`, `src/app/[locale]/account/listings/[id]/edit/*`, `src/lib/supabase/listingsClient.ts`, `src/lib/listingFormValidation.ts`, `src/lib/listingPhotoForm.ts`.

Data/security dependencies: `public.listings`, listing image upload helpers, `listing-images` Storage policies, listing mutation RPC/policy checks, user suspension RPCs.

Preserve: Listing lifecycle status and `moderation_state` are separate. A suspended account cannot create, edit, delete, change status, or manage listing photos, but existing listings remain preserved.

Tests: `tests/listingModerationApp.test.ts`, `tests/userModerationUx.test.ts`, `tests/userModerationMigration.test.ts`, `tests/securityHardeningMigration.test.ts`.

## My Listings

Purpose: Let owners manage and review their own listing history from the account area.

Routes: `/account`.

Key files: `src/app/[locale]/account/page.tsx`, `src/app/[locale]/account/AccountDashboard.tsx`, `src/app/account/listingStatusActions.ts`, `src/lib/supabase/listingsServer.ts`, `src/lib/supabase/listingsClient.ts`.

Data/security dependencies: Authenticated Supabase server/client access, owner-aware listing reads, listing status actions, user moderation checks.

Preserve: My Listings may show owner-visible listings that public pages must not show. Effects of a suspended account on My Listings must be account-scoped: listings remain preserved, lifecycle status is unchanged, `moderation_state` is unchanged, and public visibility may disappear because the seller is suspended.

Tests: `tests/listingModerationApp.test.ts`, `tests/userModerationUx.test.ts`, `tests/listingViewerOwnershipStatic.test.ts`.

## Edit Save Scroll Restoration

Purpose: Return users from an account edit flow to their prior My Listings position after a successful save.

Routes: `/account`, `/account/listings/[id]/edit?from=/account`.

Key files: `src/app/[locale]/account/listings/[id]/edit/EditListingForm.tsx`, `src/lib/resultsScrollStorage.ts`, `src/app/[locale]/account/AccountRefreshScrollManager.tsx`.

Data/security dependencies: Browser history state and account readiness before restoration.

Preserve: For account-origin edits, keep `from=/account`, `hasActiveResultsNavigation('/account')`, `requestResultsScrollRestore('/account')`, `router.back()`, and account readiness before restoring scroll.

Tests: `tests/userModerationUx.test.ts`.

## Edit Cancel Scroll Restoration

Purpose: Return users from an account edit flow to their prior My Listings position after canceling.

Routes: `/account`, `/account/listings/[id]/edit?from=/account`.

Key files: `src/app/[locale]/account/listings/[id]/edit/EditListingForm.tsx`, `src/lib/resultsScrollStorage.ts`, `src/app/[locale]/account/AccountRefreshScrollManager.tsx`.

Data/security dependencies: Browser history state and account readiness before restoration.

Preserve: Cancel should follow the same account-origin restoration contract as save: request account scroll restoration before `router.back()`, then restore only when account content is ready.

Tests: `tests/userModerationUx.test.ts`.

## Public vs Owner-Aware Listing Access

Purpose: Keep public browsing eligibility separate from authenticated owner/history visibility.

Routes: `/`, `/listing/[id]`, `/search`, `/category/[slug]`, `/category/[slug]/[subcategory]`, `/seller/[slug]`, `/account`.

Key files: `src/lib/supabase/listingsServer.ts`, `src/lib/supabase/publicSellerProfilesServer.ts`, `src/app/[locale]/listing/[id]/page.tsx`, `src/app/[locale]/search/page.tsx`, `src/app/[locale]/category/[slug]/page.tsx`, `src/app/[locale]/category/[slug]/[subcategory]/page.tsx`, `src/app/[locale]/account/page.tsx`.

Data/security dependencies: Cookie-free/public Supabase client for public loaders; authenticated Supabase access for account/owner flows; public listing visibility helpers; listing image visibility helpers; user and listing moderation checks.

Preserve: Public listing eligibility depends on the relevant public visibility rules, including lifecycle status `active` or `reserved`, listing `moderation_state` `normal`, and a seller account that is not suspended. Other DB/security checks may also apply. Owner-aware account/history reads may still expose preserved listings that are not publicly eligible. Do not merge public loaders with owner-aware reads or let owner visibility leak into public results.

Tests: `tests/listingModerationApp.test.ts`, `tests/listingViewerOwnershipStatic.test.ts`, `tests/userModerationMigration.test.ts`.

## Seller Profiles

Purpose: Show public seller identity, active public listings, and seller reviews.

Routes: `/seller/[slug]`, `/seller/[slug]/reviews`.

Key files: `src/app/[locale]/seller/[slug]/page.tsx`, `src/app/[locale]/seller/[slug]/reviews/page.tsx`, `src/app/[locale]/seller/[slug]/PublicSellerReviews.tsx`, `src/lib/supabase/publicSellerProfilesServer.ts`, `src/lib/supabase/reviews.ts`.

Data/security dependencies: Public seller profile RPCs/views, seller review RPCs, listing visibility rules, user moderation rules.

Preserve: Suspended sellers should disappear from public seller/listing visibility without deleting profile, listing, or review history.

Tests: `tests/userModerationMigration.test.ts`, `tests/reviewTags.test.ts`, `tests/reviewDateFormatting.test.ts`.

## Search, Category Results, and Back Restoration

Purpose: Let users browse filtered result pages and return to their prior scroll position after opening a listing.

Routes: `/search`, `/category/[slug]`, `/category/[slug]/[subcategory]`, `/listing/[id]`.

Key files: `src/app/[locale]/search/page.tsx`, `src/app/[locale]/category/[slug]/page.tsx`, `src/app/[locale]/category/[slug]/[subcategory]/page.tsx`, `src/app/components/ListingResults.tsx`, `src/app/components/BackToResultsLink.tsx`, `src/app/components/ResultsScrollRestorer.tsx`, `src/lib/resultsScrollStorage.ts`.

Data/security dependencies: URL filters, browser history state, public listing loaders.

Preserve: Result-page Back restoration and locale-normalized history are deliberate. Do not remove the saved-position, native traversal, or restoration request machinery just because it looks complex.

Tests: `tests/i18nRouting.test.ts`, `tests/listingModerationApp.test.ts`.

## Favorites

Purpose: Let authenticated users save and remove database listings.

Routes: Listing cards/details, `/account/favorites`.

Key files: `src/app/components/FavoriteListingButton.tsx`, `src/app/[locale]/account/favorites/page.tsx`, `src/app/[locale]/account/favorites/SavedListingsView.tsx`, `src/app/favorites/actions.ts`, `src/lib/supabase/listingFavorites.ts`, `src/lib/listingFavoriteKeys.ts`.

Data/security dependencies: `public.listing_favorites`, favorite integrity trigger, public listing availability checks.

Preserve: Normal save/remove behavior should remain stable. Suspended users may remove existing favorites but cannot add new ones. Favorite rows may remain preserved when a listing becomes temporarily unavailable.

Tests: `tests/favoriteFlowStatic.test.ts`, `tests/listingFavoriteKeys.test.ts`, `tests/securityHardeningMigration.test.ts`, `tests/userModerationMigration.test.ts`.

## Messaging

Purpose: Let buyers and sellers converse about listings while preserving conversation history.

Routes: `/contact/[listingId]`, `/account/messages`, `/account/messages/[conversationId]`.

Key files: `src/app/[locale]/contact/[listingId]/*`, `src/app/[locale]/account/messages/*`, `src/app/account/messages/actions.ts`, `src/lib/supabase/messagingServer.ts`, `src/lib/messageThreadClientBehavior.ts`.

Data/security dependencies: Messaging RPCs, conversation participant checks, read receipts, user suspension helpers.

Preserve: Existing conversation/message history remains readable. Starting a new conversation or sending new messages is blocked when either participant is suspended. New message attachment mutation follows the same messaging restriction. A suspended current user cannot edit/delete their own messages. Do not generalize beyond these established rules unless the implementation/tests prove it. Existing realtime behavior is working; do not resurrect old bug assumptions.

Tests: `tests/messageThreadClientBehavior.test.ts`, `tests/userModerationMigration.test.ts`, `tests/supabaseRealtimeDiagnostics.test.ts`.

## Private Attachments

Purpose: Let conversation participants share images without making them public web assets.

Routes: `/account/messages/[conversationId]`.

Key files: `src/app/[locale]/account/messages/[conversationId]/ConversationThread.tsx`, `src/lib/supabase/messageAttachmentUploadsClient.ts`, `src/lib/supabase/messageAttachments.ts`.

Data/security dependencies: Private `message-attachments` bucket, `public.message_attachments`, participant-only access helpers and policies.

Preserve: Message attachments are private and participant-scoped. Do not move them to public listing/profile image handling.

Tests: `tests/securityHardeningMigration.test.ts`, `tests/userModerationMigration.test.ts`.

## Realtime

Purpose: Keep account notifications and message threads fresh without manual refresh.

Routes: `/account`, `/account/notifications`, `/account/messages/[conversationId]`.

Key files: `src/lib/messagingRealtime.tsx`, `src/lib/notificationsRealtime.tsx`, `src/lib/supabase/realtimeDiagnostics.ts`, `src/app/[locale]/account/messages/[conversationId]/ConversationThread.tsx`, `src/instrumentation-client.ts`.

Data/security dependencies: Supabase realtime channels, diagnostics helpers, authenticated account context.

Preserve: Treat current realtime behavior as working. Verify before changing channel setup, diagnostics, or message refresh behavior.

Tests: `tests/supabaseRealtimeDiagnostics.test.ts`, `tests/notificationsUiStatic.test.ts`.

## Notifications

Purpose: Provide primary in-app notification delivery for account events.

Routes: `/account/notifications`, account/header notification surfaces.

Key files: `src/app/[locale]/account/notifications/*`, `src/app/account/notifications/actions.ts`, `src/lib/supabase/notifications.ts`, `src/lib/notificationsTypes.ts`, `src/lib/notificationsRealtime.tsx`, `src/app/components/SiteHeader.tsx`.

Data/security dependencies: `public.notifications`, notification RPCs, realtime notification subscriptions.

Preserve: In-app notifications are primary. Saved-listing availability notifications should fire only for meaningful availability-boundary changes, not every internal status or moderation update.

Tests: `tests/notificationsTypes.test.ts`, `tests/notificationsUiStatic.test.ts`, `tests/notificationsMigration.test.ts`.

## Seller Reviews

Purpose: Let buyers review completed sellers using the constrained product model.

Routes: `/account`, `/account/reviews`, `/seller/[slug]`, `/seller/[slug]/reviews`.

Key files: `src/app/[locale]/account/PurchasesToReview.tsx`, `src/app/[locale]/account/reviews/page.tsx`, `src/app/[locale]/account/AccountReviewsSummary.tsx`, `src/lib/supabase/reviews.ts`, `src/lib/reviewTags.ts`.

Data/security dependencies: Completed listing transactions, `public.seller_reviews`, review tag validation, review mutation refresh storage.

Preserve: Reviews are stars plus predefined tags only. Do not add free text, photos, seller responses, or multiple-buyer UX without an explicit product change. Completed-sale metadata exists for internal marketplace/review functionality, not in-site payment.

Tests: `tests/reviewTags.test.ts`, `tests/reviewDateFormatting.test.ts`, `tests/securityHardeningMigration.test.ts`.

## Listing Reporting and Moderation

Purpose: Let users report listings and let admins hide or restore public listing visibility without destroying owner history.

Routes: Listing report controls, `/admin/reports`.

Key files: `src/app/listing/reportActions.ts`, `src/app/admin/reports/*`, `src/lib/supabase/listingReports.ts`, `src/lib/listingReports.ts`, `src/lib/supabase/adminModeration.ts`.

Data/security dependencies: Listing report tables/RPCs, `private.moderation_audit_events`, listing `moderation_state`, admin authorization helpers.

Preserve: Listing lifecycle status and moderation state are orthogonal. Hidden listings are preserved, remain owner-visible where appropriate, and should not be changed into deleted/sold/expired listings.

Tests: `tests/listingReportState.test.ts`, `tests/listingModerationApp.test.ts`, `tests/listingModerationMigration.test.ts`.

## User Suspension

Purpose: Restrict harmful account actions while preserving identity, history, and auditability.

Routes: `/account`, `/account/listings/[id]/edit`, messaging/review/favorites mutation surfaces.

Key files: `src/lib/supabase/adminModeration.ts`, `src/app/[locale]/account/AccountDashboard.tsx`, `src/app/[locale]/account/listings/[id]/edit/EditListingForm.tsx`, `src/lib/supabase/listingsClient.ts`, `src/lib/supabase/messagingServer.ts`.

Data/security dependencies: `private.user_moderation`, `private.user_moderation_audit_events`, `current_user_is_suspended`, `private.user_is_suspended`.

Preserve: Suspension has states `normal` and `suspended`. It does not disable Auth, mutate listing lifecycle status, mutate listing `moderation_state`, or erase reads/history. Mutations remain restricted, message history remains readable, and new messaging is blocked if either participant is suspended.

Tests: `tests/userModerationMigration.test.ts`, `tests/userModerationUx.test.ts`.

## Admin User Moderation

Purpose: Let admins inspect and change user moderation state through narrow, audited paths.

Routes: `/admin/users/[id]`.

Key files: `src/app/[locale]/admin/users/[id]/*`, `src/app/admin/users/actions.ts`, `src/lib/supabase/adminModeration.ts`.

Data/security dependencies: Admin-only RPC wrappers, user moderation audit reads, role-stable authorization.

Preserve: Admins cannot suspend themselves or other admins. Browser-facing code should use narrow admin RPC wrappers, not private arbitrary-user helpers.

Tests: `tests/userModerationMigration.test.ts`, `tests/userModerationUx.test.ts`.

## Storage Visibility

Purpose: Keep user media visible only at the level intended by the product and security model.

Routes: Listing pages/cards, seller/account profile surfaces, message threads.

Key files: `src/lib/supabase/listingPhotoUploadsClient.ts`, `src/lib/supabase/listingImages.ts`, `src/lib/supabase/profileAvatarUploadsClient.ts`, `src/lib/supabase/profileAvatars.ts`, `src/lib/supabase/messageAttachmentUploadsClient.ts`, `src/lib/supabase/messageAttachments.ts`.

Data/security dependencies: Public `listing-images`, public `profile-avatars`, private `message-attachments`, Storage RLS policies, upload limits.

Preserve: Bucket visibility and policies are intentional product/security behavior. Do not make message attachments public, privatize public listing/profile assets, or casually alter Storage ownership/upload policies.

Tests: `tests/securityHardeningMigration.test.ts`, `tests/userModerationMigration.test.ts`.

## Production Frontend Privacy

Purpose: Avoid accidentally exposing a private frontend while keeping production-facing API behavior stable.

Routes: Production routing and hosting only when explicitly instructed.

Key files: `setup.md`.

Data/security dependencies: Production API, environment variables, VPS services, Caddy routes.

Preserve: The frontend is intentionally private and not publicly routed yet; the API is production-facing. `charlal.ru` may be referenced as the project/domain name, but do not advertise it as a live public demo. Do not add a public `charlal.ru` Caddy frontend route, deploy, migrate production DB, modify VPS services/env, or expose the frontend unless explicitly instructed.
