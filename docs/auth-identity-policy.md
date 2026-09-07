# Authentication Identity Policy

This policy records Charlal's stable account and identity rules before any OAuth
provider proof of concept. It is intentionally operational: provider work must
preserve marketplace ownership and must not merge accounts from email text alone.

Supabase reference points:

- Supabase Auth identities are login methods linked to a user, and one user can
  have more than one identity:
  https://supabase.com/docs/guides/auth/identities
- Supabase Auth supports automatic same-email identity linking and separately
  supports manual linking:
  https://supabase.com/docs/guides/auth/auth-identity-linking
- Supabase custom OAuth/OIDC providers require an email by default; email-less
  provider sign-in requires `email_optional = true`:
  https://supabase.com/docs/guides/auth/custom-oauth-providers
- Supabase Confirm Email controls whether email must be confirmed before first
  sign-in; disabling it means the project treats email verification as
  unnecessary for sign-in:
  https://supabase.com/docs/guides/auth/general-configuration

## Stable Charlal Identity

- One marketplace account is anchored to one `auth.users.id`.
- `public.profiles.id` references `auth.users.id`, and marketplace ownership
  fields such as listings, messages, reviews, favorites, notifications, and
  moderation records remain owned by that UUID.
- Provider changes must not accidentally create a new marketplace identity for an
  existing user, and must not rewrite marketplace ownership UUIDs to make a login
  flow appear convenient.

## Email Requirement

- Charlal currently requires `AppUser.email`.
- Email-less OAuth accounts are unsupported for now.
- Adding email-less accounts would require a separately approved `AppUser` and UI
  redesign before any provider is enabled with `email_optional = true`.

## Same-Email Provider Linking

- Same-email automatic linking is allowed only when both existing Charlal email
  ownership and provider email trust are established.
- Matching email text alone is never proof of identity.
- Before automatic same-email provider linking is relied upon in production:
  - Charlal email/password signup must use genuine email confirmation in
    production.
  - The provider integration must prove that the email supplied to Supabase is
    trusted or sufficiently verified for account-linking purposes.
- The local `supabase/config.toml` setting `enable_confirmations = false` is a
  local development setting and must not be treated as Charlal's desired
  production security policy.

## Different-Email Provider Identities

- A different provider email does not automatically merge with an existing
  Charlal account.
- The user must authenticate the existing account first before any future manual
  linking.
- Otherwise, provider login creates or remains a separate account according to
  Supabase behavior.

## Multiple Login Methods

Charlal may eventually allow one `auth.users.id` to have these login methods:

- Email/password
- Yandex
- VK ID or supported Mail login

Do not implement provider-linking UI yet.

## Manual Linking

- Manual linking may be considered later.
- It requires explicit signed-in user action.
- Do not enable or use it casually.
- Never use email text alone to merge marketplace accounts.

## Unlinking

- Unlinking is not MVP.
- It must never remove the user's last viable login method.
- Implement it only together with account settings or provider management UX.

## Duplicate Charlal Accounts

- There is no automatic account merge in MVP.
- Do not rewrite marketplace ownership UUIDs.
- Duplicate-account resolution is support/manual only for MVP.
- Future merge tooling requires a separately designed and audited workflow.

## Provider Profile Metadata

- Provider name, avatar, and email must not silently overwrite existing Charlal
  profile data.
- External identity metadata is authentication metadata, not authoritative
  marketplace profile data.
- Initial provider-created profile behavior may be designed per provider later.

## Provider Email Changes

- Changing a provider email must not change marketplace ownership identity.
- `auth.users.id` remains the stable anchor.

## Yandex / VK / Mail Rollout Rule

No provider is production-enabled until a proof of concept confirms:

- Supabase compatibility.
- Callback flow.
- Email availability.
- Email trust and verification semantics.
- Existing-account linking behavior.
- New-account profile creation.
- No duplicate-account surprise.
- No provider tokens or secrets leak.

## Explicit Non-Goals

- No account merging in MVP.
- No email-less accounts now.
- No Connected Accounts UI yet.
- No provider auto-linking based on untrusted email.
- No provider metadata overwriting marketplace profile.
