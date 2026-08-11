create or replace function public.generate_public_seller_slug()
returns text
language sql
set search_path = public, pg_temp
as $$
  select 'seller-' || replace(gen_random_uuid()::text, '-', '')
$$;

alter table public.profiles
add column if not exists public_slug text,
add column if not exists bio text,
add column if not exists location text;

do $$
declare
  profile_record record;
  candidate_slug text;
begin
  for profile_record in
    select id
    from public.profiles
    where public_slug is null or btrim(public_slug) = ''
  loop
    loop
      candidate_slug := public.generate_public_seller_slug();

      exit when not exists (
        select 1
        from public.profiles
        where public_slug = candidate_slug
      );
    end loop;

    update public.profiles
    set public_slug = candidate_slug
    where id = profile_record.id;
  end loop;
end;
$$;

alter table public.profiles
alter column public_slug set default public.generate_public_seller_slug();

alter table public.profiles
alter column public_slug set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_public_slug_format'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_public_slug_format
    check (public_slug ~ '^seller-[a-f0-9]{32}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_not_blank'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_bio_not_blank
    check (bio is null or length(btrim(bio)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_bio_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 500);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_location_not_blank'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_location_not_blank
    check (location is null or length(btrim(location)) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_location_length'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_location_length
    check (location is null or char_length(location) <= 100);
  end if;
end;
$$;

create unique index if not exists profiles_public_slug_key
on public.profiles (public_slug);

create or replace function public.normalize_profile_public_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.public_slug := btrim(new.public_slug);
  new.bio := nullif(btrim(new.bio), '');
  new.location := nullif(btrim(new.location), '');

  return new;
end;
$$;

drop trigger if exists profiles_normalize_public_fields on public.profiles;
create trigger profiles_normalize_public_fields
before insert or update on public.profiles
for each row
execute function public.normalize_profile_public_fields();

create or replace function public.prevent_profile_id_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if new.public_slug <> old.public_slug then
    raise exception 'Profile public slug cannot be changed';
  end if;

  return new;
end;
$$;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');

  if safe_display_name is null or safe_display_name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    safe_display_name := 'Marketplace user';
  end if;

  safe_display_name := left(safe_display_name, 80);

  insert into public.profiles (id, display_name)
  values (new.id, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

grant update (display_name, bio, location) on public.profiles to authenticated;

drop function if exists public.get_public_seller_profile(text);
create function public.get_public_seller_profile(p_public_slug text)
returns table (
  public_slug text,
  display_name text,
  bio text,
  location text,
  member_since timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    p.display_name,
    p.bio,
    p.location,
    p.created_at as member_since
  from public.profiles p
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
  limit 1
$$;

revoke all on function public.get_public_seller_profile(text) from public;
grant execute on function public.get_public_seller_profile(text) to anon, authenticated;

drop function if exists public.list_public_seller_listings(text);
create function public.list_public_seller_listings(p_public_slug text)
returns table (
  id text,
  seller_display_name text,
  title text,
  description text,
  price numeric,
  location text,
  category text,
  subcategory text,
  transaction_type text,
  property_type text,
  marketplace_type text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    l.id,
    l.seller_display_name,
    l.title,
    l.description,
    l.price,
    l.location,
    l.category,
    l.subcategory,
    l.transaction_type,
    l.property_type,
    l.marketplace_type,
    l.created_at,
    l.updated_at
  from public.profiles p
  join public.listings l
    on l.owner_id = p.id
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
  order by l.created_at desc, l.id desc
$$;

revoke all on function public.list_public_seller_listings(text) from public;
grant execute on function public.list_public_seller_listings(text) to anon, authenticated;

drop function if exists public.get_listing_public_seller_slug(text);
create function public.get_listing_public_seller_slug(p_listing_id text)
returns text
language sql
security definer
set search_path = ''
as $$
  select p.public_slug
  from public.listings l
  join public.profiles p
    on p.id = l.owner_id
  where l.id = btrim(p_listing_id)
  limit 1
$$;

revoke all on function public.get_listing_public_seller_slug(text) from public;
grant execute on function public.get_listing_public_seller_slug(text) to anon, authenticated;

notify pgrst, 'reload schema';
