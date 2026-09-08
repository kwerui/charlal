# VK ID / Mail.ru Authentication Compatibility

## Status

Deferred.

Production VK/Mail login is not approved.

No live VK ID provider proof of concept was executed. Despite the filename, this
document records a compatibility audit against Charlal's current self-hosted
Supabase Auth architecture.

Do not create a VK application, configure provider secrets, enable VK/Mail login,
or touch production based on this document.

## Environment Evaluated

- Local Supabase CLI 2.116.0.
- Local GoTrue v2.195.0.
- Charlal `@supabase/ssr` PKCE callback architecture.
- Generic Charlal `/auth/callback` route.
- Stable marketplace identity policy: one Charlal account is anchored to one
  `auth.users.id`.
- Charlal `AppUser` requires a usable email.

The identity policy in [Authentication identity policy](auth-identity-policy.md)
remains authoritative.

## Current VK Product

Current VK integrations should evaluate modern VK ID, not legacy VK OAuth.

VK ID is the current authorization product for new web applications. Its Web
documentation describes Authorization Code Flow with PKCE and supports VK ID
login plus optional additional login pathways through Mail and Odnoklassniki
inside the VK ID ecosystem.

Relevant official documentation:

- https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/create-application
- https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/start-integration/how-auth-works/auth-flow-web
- https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/api-description

## Direct GoTrue Incompatibilities

VK ID's documented authorization callback returns:

- `code`
- `state`
- `device_id`

VK's documented token exchange requires the returned `device_id` to be included
with the authorization code exchange.

Stock GoTrue v2.195.0 custom OAuth does not provide generic plumbing to copy
arbitrary dynamic provider callback parameters into the provider token request.
This incompatibility occurs before userinfo retrieval. A userinfo-only
normalization adapter cannot solve it.

VK userinfo introduces a second incompatibility. It is documented as:

```text
POST https://id.vk.ru/oauth2/user_info
```

The request requires provider-specific parameters such as `client_id`, and the
response is nested/provider-specific, for example:

```text
user.user_id
user.email
```

GoTrue v2.195.0's custom OAuth userinfo path is a generic GET request that maps
top-level standard typed claims such as `sub`, `email`, and `email_verified`.
Even if `device_id` were solved, VK userinfo would still require adaptation.

## Why A Small Adapter Is Insufficient

The Yandex POC showed that a narrow userinfo normalization adapter can be
technically plausible when authorization, PKCE, token exchange, and userinfo HTTP
retrieval already work and only the returned claim names need normalization.

VK ID fails earlier. A VK integration would need provider-specific participation
in:

- authorization flow;
- VK callback handling;
- `state` and `device_id` handling;
- token exchange;
- provider-token handling;
- userinfo retrieval;
- claims normalization.

That is materially an OAuth broker or provider-specific Supabase Auth
adaptation, not a narrow Yandex-style userinfo adapter.

## Email Findings

VK ID can provide email when email access is configured in the VK ID application
and requested with the appropriate scope.

Email may be optional depending on application configuration. Charlal must
continue requiring email, and `email_optional = true` is not an acceptable
workaround for VK/Mail login.

VK documentation describes email confirmation behavior when a user provides an
email during VK ID authorization, but this audit did not prove a standard
`email_verified` claim. VK's documented `verified` userinfo field refers to
profile/account verification, not email verification.

Production same-email automatic linking is therefore not approved. Matching
email text alone remains insufficient under Charlal's identity policy.

## Mail.ru Decision

Do not pursue separate legacy Mail.ru OAuth for Charlal.

If VK/Mail authentication is revisited later, prefer the modern VK ID ecosystem
that can cover VK, Mail, and Odnoklassniki login pathways. Mail.ru should be
deferred together with VK ID.

## Comparison To Yandex

Yandex:

- authorization worked;
- token exchange worked;
- userinfo HTTP worked;
- blocker was raw-claims normalization;
- a narrow userinfo adapter is technically plausible;
- final end-to-end test was deferred because the available Yandex identity had
  no usable email.

VK ID:

- documented incompatibility occurs earlier;
- dynamic `device_id` is required for token exchange;
- stock GoTrue cannot express that flow;
- userinfo has another POST/nested-claims incompatibility;
- implementation requires substantially more provider-specific infrastructure.

If Charlal later prioritizes one Russian social provider, Yandex currently
appears architecturally simpler than VK ID.

Do not call either provider production-ready.

## Possible Future Architectures

Possible future architectures, neither endorsed yet:

1. Russian-hosted OAuth broker that owns VK-specific OAuth mechanics and returns
   normalized claims to Supabase Auth.
2. Provider-specific Supabase Auth adaptation or fork that adds native VK ID
   callback, token exchange, userinfo, and claim handling.

Either path would need separate security, operational, and maintenance review.

## Resume Conditions

Revisit VK/Mail authentication only when:

- social login has demonstrated product value or need;
- infrastructure and security cost is justified;
- provider/email policy can be tested safely;
- Charlal is prepared to own the bridge or Auth patch operationally;
- same-email linking behavior can be tested without weakening the identity
  policy;
- no provider tokens or secrets are logged, persisted separately, or exposed in
  the UI.

## Classification

D. Requires auth bridge / provider-specific Auth adaptation.
