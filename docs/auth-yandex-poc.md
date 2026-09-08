# Yandex Authentication POC

## Status

Deferred, not abandoned.

Production Yandex login is not approved.

## Environment Tested

- Supabase CLI 2.116.0
- Local GoTrue v2.195.0
- Custom OAuth provider identifier `custom:yandex`
- Local Charlal `/auth/callback` PKCE flow

## What Worked

- Yandex OAuth application registration
- Localhost Supabase callback
- Yandex authorization
- PKCE
- Token exchange
- Yandex userinfo HTTP request
- Yandex returned HTTP 200
- Local GoTrue could reach a Russian-hosted HTTPS normalization adapter
- The adapter could securely transform Yandex-specific userinfo into standard claim shape

## Direct GoTrue Incompatibility

Yandex JSON uses provider-specific fields such as:

- `psuid`
- `default_email`
- `login`

GoTrue v2.195.0 custom OAuth mapping could not map those raw provider-specific fields into the required standard typed claims.

Direct `custom:yandex` therefore did not produce a usable Charlal user.

This should not be described as a Bearer-header failure. Logs showed Yandex userinfo HTTP requests succeeded.

## Adapter Finding

A tiny HTTPS normalization adapter is technically viable:

```text
Yandex:
psuid
default_email
login

standard claims:
sub
email
preferred_username
```

The adapter:

- requires a bearer token from GoTrue
- forwards it to Yandex using Yandex's documented OAuth authorization scheme
- does not store or log the token
- does not store userinfo
- does not create Supabase users itself

This is not production-approved architecture yet.

## Email Blocker

The available disposable Yandex account returned:

- `psuid` present
- `default_email` key present but no usable value
- `emails` present but empty array

Charlal currently requires `AppUser.email`.

The POC intentionally did not:

- enable `email_optional`
- manufacture an email
- manufacture `email_verified`
- weaken the email requirement

The end-to-end `auth.users` creation test is therefore incomplete.

## Identity And Linking Status

Not tested:

- different-email existing account
- same-email password account
- automatic linking
- manual linking
- duplicate-account behavior

The existing auth identity policy still applies.

## Production Status

Not production-ready.

Before Yandex can be reconsidered:

1. Obtain a disposable Yandex account that actually returns a usable email.
2. Repeat the adapter-backed new-account test.
3. Prove `auth.users`, `auth.identities`, and profile creation.
4. Prove repeated login resolves to the same `auth.users.id`.
5. Separately evaluate email trust.
6. Only then consider collision/linking tests.
7. Separately design production hosting and operations for any adapter.

## Cleanup Completed

Temporary items removed:

- local `custom:yandex` provider
- local `yandex-poc` launcher
- VPS adapter
- temporary Caddy route

No production Supabase/Auth changes were made.

The temporary DNS record should also be removed if still present.

## Classification

Technically feasible with a small normalization adapter, but end-to-end account creation is deferred because the available Yandex test identity did not provide a usable email.

Do not classify Yandex as fully supported or production-ready.
