begin;

delete from public.listing_favorites
where listing_source = 'builtin';

alter table public.listing_favorites
drop constraint if exists listing_favorites_listing_source_valid;

alter table public.listing_favorites
add constraint listing_favorites_listing_source_valid check (
  listing_source = 'database'
);

create or replace function public.prepare_listing_favorite_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  normalized_source text;
  normalized_listing_id text;
  database_listing_is_saveable boolean;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to save listing';
  end if;

  if new.user_id is distinct from viewer_id then
    raise exception 'Favorite user must match authenticated user';
  end if;

  normalized_source := btrim(coalesce(new.listing_source, ''));
  normalized_listing_id := btrim(coalesce(new.listing_id, ''));

  if normalized_source <> 'database' or normalized_listing_id = '' then
    raise exception 'Listing cannot be saved';
  end if;

  new.listing_source := normalized_source;
  new.listing_id := normalized_listing_id;
  new.created_at := coalesce(new.created_at, now());

  if new.listing_id ~ '^[0-9]+$' then
    raise exception 'Listing cannot be saved';
  end if;

  select exists (
    select 1
    from public.listings l
    where l.id = new.listing_id
      and l.status in ('active', 'reserved')
      and l.owner_id <> viewer_id
  )
  into database_listing_is_saveable;

  if not database_listing_is_saveable then
    raise exception 'Listing cannot be saved';
  end if;

  return new;
end;
$$;

alter function public.prepare_listing_favorite_write()
owner to postgres;

delete from public.listing_favorites lf
where not exists (
  select 1
  from public.listings l
  where l.id = btrim(lf.listing_id)
    and l.status in ('active', 'reserved')
    and l.owner_id <> lf.user_id
);

drop policy if exists "listing_favorites_insert_own" on public.listing_favorites;
create policy "listing_favorites_insert_own"
on public.listing_favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and listing_source = 'database'
);

revoke all on function public.prepare_listing_favorite_write() from public;
revoke all on function public.prepare_listing_favorite_write() from anon;
revoke all on function public.prepare_listing_favorite_write() from authenticated;

notify pgrst, 'reload schema';

commit;
