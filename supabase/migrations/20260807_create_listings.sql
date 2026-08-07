create table if not exists public.listings (
  id text primary key default ('db-' || gen_random_uuid()::text),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  seller_display_name text not null default 'Marketplace user',
  title text not null,
  description text not null,
  price numeric not null,
  location text not null,
  category text not null,
  subcategory text not null,
  transaction_type text,
  property_type text,
  marketplace_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_id_not_blank check (length(btrim(id)) > 0),
  constraint listings_id_not_builtin_numeric check (id !~ '^[0-9]+$'),
  constraint listings_seller_display_name_not_blank check (length(btrim(seller_display_name)) > 0),
  constraint listings_title_not_blank check (length(btrim(title)) > 0),
  constraint listings_description_not_blank check (length(btrim(description)) > 0),
  constraint listings_location_not_blank check (length(btrim(location)) > 0),
  constraint listings_category_not_blank check (length(btrim(category)) > 0),
  constraint listings_subcategory_not_blank check (length(btrim(subcategory)) > 0),
  constraint listings_price_not_negative check (price >= 0),
  constraint listings_title_length check (char_length(title) <= 240),
  constraint listings_description_length check (char_length(description) <= 10000),
  constraint listings_location_length check (char_length(location) <= 240),
  constraint listings_category_length check (char_length(category) <= 80),
  constraint listings_subcategory_length check (char_length(subcategory) <= 120),
  constraint listings_transaction_type_valid check (
    transaction_type is null or transaction_type in ('sale', 'rent')
  ),
  constraint listings_property_type_valid check (
    property_type is null or property_type in ('apartments', 'land', 'commercial', 'storage')
  ),
  constraint listings_housing_fields_valid check (
    (
      category = 'housing' and
      subcategory in ('sale', 'rent') and
      transaction_type = subcategory and
      property_type is not null and
      marketplace_type is null
    ) or (
      category <> 'housing' and
      transaction_type is null and
      property_type is null
    )
  ),
  constraint listings_marketplace_fields_valid check (
    (
      category = 'marketplace' and
      subcategory = 'buy' and
      marketplace_type is not null and
      length(btrim(marketplace_type)) > 0
    ) or (
      not (category = 'marketplace' and subcategory = 'buy') and
      marketplace_type is null
    )
  )
);

create index if not exists listings_owner_id_created_at_idx
on public.listings (owner_id, created_at desc);

create index if not exists listings_category_subcategory_idx
on public.listings (category, subcategory);

create index if not exists listings_created_at_idx
on public.listings (created_at desc);

create or replace function public.get_profile_display_name(profile_id uuid)
returns text
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(btrim(display_name), ''),
    'Marketplace user'
  )
  from public.profiles
  where id = profile_id
$$;

create or replace function public.prepare_listing_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  verified_owner_id uuid;
  profile_name text;
begin
  verified_owner_id := auth.uid();

  if verified_owner_id is null then
    raise exception 'Authenticated user is required to create a listing';
  end if;

  profile_name := public.get_profile_display_name(verified_owner_id);

  new.owner_id := verified_owner_id;
  new.seller_display_name := coalesce(profile_name, 'Marketplace user');
  new.id := btrim(coalesce(new.id, ''));
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.location := btrim(new.location);
  new.category := btrim(new.category);
  new.subcategory := btrim(new.subcategory);
  new.transaction_type := nullif(btrim(new.transaction_type), '');
  new.property_type := nullif(btrim(new.property_type), '');
  new.marketplace_type := nullif(btrim(new.marketplace_type), '');
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  if new.id = '' then
    new.id := 'db-' || gen_random_uuid()::text;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_prepare_insert on public.listings;
create trigger listings_prepare_insert
before insert on public.listings
for each row
execute function public.prepare_listing_insert();

create or replace function public.prepare_listing_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_name text;
  content_changed boolean;
begin
  if new.id <> old.id then
    raise exception 'Listing id cannot be changed';
  end if;

  if new.owner_id <> old.owner_id then
    raise exception 'Listing owner cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Listing creation time cannot be changed';
  end if;

  profile_name := public.get_profile_display_name(old.owner_id);

  new.seller_display_name := coalesce(profile_name, old.seller_display_name);
  new.title := btrim(new.title);
  new.description := btrim(new.description);
  new.location := btrim(new.location);
  new.category := btrim(new.category);
  new.subcategory := btrim(new.subcategory);
  new.transaction_type := nullif(btrim(new.transaction_type), '');
  new.property_type := nullif(btrim(new.property_type), '');
  new.marketplace_type := nullif(btrim(new.marketplace_type), '');

  content_changed :=
    new.title is distinct from old.title or
    new.description is distinct from old.description or
    new.price is distinct from old.price or
    new.location is distinct from old.location or
    new.category is distinct from old.category or
    new.subcategory is distinct from old.subcategory or
    new.transaction_type is distinct from old.transaction_type or
    new.property_type is distinct from old.property_type or
    new.marketplace_type is distinct from old.marketplace_type;

  if content_changed then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists listings_prepare_update on public.listings;
create trigger listings_prepare_update
before update on public.listings
for each row
execute function public.prepare_listing_update();

create or replace function public.sync_listing_seller_display_name()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.listings
  set seller_display_name = new.display_name
  where owner_id = new.id
    and seller_display_name is distinct from new.display_name;

  return new;
end;
$$;

drop trigger if exists profiles_sync_listing_seller_display_name on public.profiles;
create trigger profiles_sync_listing_seller_display_name
after update of display_name on public.profiles
for each row
execute function public.sync_listing_seller_display_name();

alter table public.listings enable row level security;

revoke all on public.listings from anon;
revoke all on public.listings from authenticated;
revoke all on public.listings from public;

grant usage on schema public to anon, authenticated;
grant select on public.listings to anon, authenticated;
grant insert (
  id,
  title,
  description,
  price,
  location,
  category,
  subcategory,
  transaction_type,
  property_type,
  marketplace_type,
  created_at,
  updated_at
) on public.listings to authenticated;
grant update (
  title,
  description,
  price,
  location,
  category,
  subcategory,
  transaction_type,
  property_type,
  marketplace_type
) on public.listings to authenticated;
grant delete on public.listings to authenticated;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings
for select
to anon, authenticated
using (true);

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own"
on public.listings
for insert
to authenticated
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own"
on public.listings
for update
to authenticated
using (auth.uid() is not null and auth.uid() = owner_id)
with check (auth.uid() is not null and auth.uid() = owner_id);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own"
on public.listings
for delete
to authenticated
using (auth.uid() is not null and auth.uid() = owner_id);
