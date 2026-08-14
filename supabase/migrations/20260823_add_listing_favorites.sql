create table if not exists public.listing_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_source text not null,
  listing_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_source, listing_id),
  constraint listing_favorites_listing_source_valid check (
    listing_source in ('database', 'builtin')
  ),
  constraint listing_favorites_listing_id_not_blank check (
    length(btrim(listing_id)) > 0
  )
);

create index if not exists listing_favorites_user_created_at_idx
on public.listing_favorites (user_id, created_at desc);

create index if not exists listing_favorites_listing_lookup_idx
on public.listing_favorites (listing_source, listing_id);

alter table public.listing_favorites enable row level security;

revoke all on public.listing_favorites from anon;
revoke all on public.listing_favorites from authenticated;
revoke all on public.listing_favorites from public;

grant select, insert, delete on public.listing_favorites to authenticated;

drop policy if exists "listing_favorites_select_own" on public.listing_favorites;
create policy "listing_favorites_select_own"
on public.listing_favorites
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "listing_favorites_insert_own" on public.listing_favorites;
create policy "listing_favorites_insert_own"
on public.listing_favorites
for insert
to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "listing_favorites_delete_own" on public.listing_favorites;
create policy "listing_favorites_delete_own"
on public.listing_favorites
for delete
to authenticated
using (user_id = (select auth.uid()));
