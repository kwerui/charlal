begin;

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
  allowed_builtin_listing_ids constant text[] := array[
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '101',
    '102',
    '103',
    '104',
    '105',
    '106',
    '107',
    '108',
    '201',
    '202',
    '203',
    '204',
    '301',
    '302',
    '303',
    '401',
    '501',
    '502',
    '601',
    '602',
    '603'
  ]::text[];
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

  if normalized_listing_id = '' then
    raise exception 'Listing cannot be saved';
  end if;

  new.listing_source := normalized_source;
  new.listing_id := normalized_listing_id;
  new.created_at := coalesce(new.created_at, now());

  if new.listing_source = 'database' then
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
  elsif new.listing_source = 'builtin' then
    if new.listing_id <> all(allowed_builtin_listing_ids) then
      raise exception 'Listing cannot be saved';
    end if;
  else
    raise exception 'Listing cannot be saved';
  end if;

  return new;
end;
$$;

alter function public.prepare_listing_favorite_write()
owner to postgres;

delete from public.listing_favorites lf
where not (
  (
    lf.listing_source = 'database'
    and exists (
      select 1
      from public.listings l
      where l.id = btrim(lf.listing_id)
        and l.status in ('active', 'reserved')
        and l.owner_id <> lf.user_id
    )
  )
  or (
    lf.listing_source = 'builtin'
    and btrim(lf.listing_id) = any(array[
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '101',
      '102',
      '103',
      '104',
      '105',
      '106',
      '107',
      '108',
      '201',
      '202',
      '203',
      '204',
      '301',
      '302',
      '303',
      '401',
      '501',
      '502',
      '601',
      '602',
      '603'
    ]::text[])
  )
);

drop trigger if exists listing_favorites_prepare_write
on public.listing_favorites;

create trigger listing_favorites_prepare_write
before insert or update on public.listing_favorites
for each row
execute function public.prepare_listing_favorite_write();

revoke all on function public.prepare_listing_favorite_write() from public;
revoke all on function public.prepare_listing_favorite_write() from anon;
revoke all on function public.prepare_listing_favorite_write() from authenticated;

grant select, insert, delete on public.listing_favorites to authenticated;

notify pgrst, 'reload schema';

commit;
