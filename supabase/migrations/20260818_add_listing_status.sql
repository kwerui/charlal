alter table public.listings
add column if not exists status text not null default 'active';

alter table public.listings
drop constraint if exists listings_status_check;

alter table public.listings
add constraint listings_status_check
check (status in ('active', 'reserved', 'sold', 'archived'));

create index if not exists listings_status_created_at_idx
on public.listings (status, created_at desc);

grant update (status) on public.listings to authenticated;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings
for select
to anon, authenticated
using (
  status <> 'archived'
  or (
    (select auth.uid()) is not null
    and owner_id = (select auth.uid())
  )
);

create or replace function public.prepare_listing_update()
returns trigger
language plpgsql
security definer
set search_path = ''
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
    new.marketplace_type is distinct from old.marketplace_type or
    new.status is distinct from old.status;

  if content_changed then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

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
  status text,
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
    l.status,
    l.created_at,
    l.updated_at
  from public.profiles p
  join public.listings l
    on l.owner_id = p.id
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
    and l.status in ('active', 'reserved')
  order by l.created_at desc, l.id desc
$$;

revoke all on function public.list_public_seller_listings(text) from public;
revoke all on function public.list_public_seller_listings(text) from anon;
grant execute on function public.list_public_seller_listings(text) to anon, authenticated;

create or replace function public.get_listing_public_seller_slug(p_listing_id text)
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
    and l.status <> 'archived'
  limit 1
$$;

revoke all on function public.get_listing_public_seller_slug(text) from public;
grant execute on function public.get_listing_public_seller_slug(text) to anon, authenticated;

create or replace function public.start_listing_conversation(
  p_listing_id text,
  p_initial_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_buyer_id uuid;
  safe_listing_id text;
  safe_message text;
  listing_record record;
  buyer_name text;
  seller_name text;
  conversation_id uuid;
begin
  verified_buyer_id := auth.uid();

  if verified_buyer_id is null then
    raise exception 'Authenticated user is required to start a conversation';
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));
  safe_message := btrim(coalesce(p_initial_message, ''));

  if safe_listing_id = '' then
    raise exception 'Listing is required';
  end if;

  if length(safe_message) = 0 then
    raise exception 'Message body cannot be empty';
  end if;

  if char_length(safe_message) > 2000 then
    raise exception 'Message body is too long';
  end if;

  select l.id, l.owner_id, l.title, l.seller_display_name, l.status
  into listing_record
  from public.listings l
  where l.id = safe_listing_id;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.status in ('sold', 'archived') then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.owner_id = verified_buyer_id then
    raise exception 'You cannot message yourself';
  end if;

  select coalesce(nullif(btrim(p.display_name), ''), 'Marketplace user')
  into buyer_name
  from public.profiles p
  where p.id = verified_buyer_id;

  select coalesce(nullif(btrim(p.display_name), ''), nullif(btrim(listing_record.seller_display_name), ''), 'Marketplace user')
  into seller_name
  from public.profiles p
  where p.id = listing_record.owner_id;

  buyer_name := coalesce(nullif(btrim(buyer_name), ''), 'Marketplace user');
  seller_name := coalesce(nullif(btrim(seller_name), ''), 'Marketplace user');

  insert into public.conversations (
    listing_id,
    listing_title_snapshot,
    buyer_id,
    seller_id,
    buyer_display_name,
    seller_display_name
  )
  values (
    listing_record.id,
    btrim(listing_record.title),
    verified_buyer_id,
    listing_record.owner_id,
    buyer_name,
    seller_name
  )
  on conflict (listing_id, buyer_id) where listing_id is not null
  do update set updated_at = public.conversations.updated_at
  returning id into conversation_id;

  insert into public.messages (conversation_id, body)
  values (conversation_id, safe_message);

  return conversation_id;
end;
$$;

revoke all on function public.start_listing_conversation(text, text) from public;
revoke all on function public.start_listing_conversation(text, text) from anon;
grant execute on function public.start_listing_conversation(text, text) to authenticated;

notify pgrst, 'reload schema';
