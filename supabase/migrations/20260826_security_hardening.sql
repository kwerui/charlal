alter table public.listings
drop constraint if exists listings_category_subcategory_known;

alter table public.listings
add constraint listings_category_subcategory_known check (
  (category = 'housing' and subcategory in ('sale', 'rent'))
  or (category = 'marketplace' and subcategory in ('buy', 'free', 'wanted'))
  or (category = 'auto' and subcategory in ('used-cars', 'new-cars', 'auto-parts', 'rent'))
  or (category = 'jobs' and subcategory in ('find-talents', 'find-jobs'))
  or (category = 'services' and subcategory = 'all')
  or (category = 'events' and subcategory in ('events', 'night-clubs', 'lost-found'))
);

alter table public.listings
drop constraint if exists listings_marketplace_type_known;

alter table public.listings
add constraint listings_marketplace_type_known check (
  marketplace_type is null
  or marketplace_type in (
    'clothing',
    'shoes',
    'office',
    'new',
    'used',
    'home-goods',
    'appliances',
    'furniture',
    'pets',
    'kids',
    'construction materials',
    'books',
    'beauty',
    'games'
  )
);

revoke select on public.listings from anon;
revoke select on public.listings from authenticated;

grant select (
  id,
  seller_display_name,
  title,
  description,
  price,
  location,
  category,
  subcategory,
  transaction_type,
  property_type,
  marketplace_type,
  status,
  created_at,
  updated_at
) on public.listings to anon, authenticated;

create or replace function public.current_user_owns_listing(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null
     or safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and l.owner_id = viewer_id
  );
end;
$$;

create or replace function public.list_current_user_owned_listing_ids(
  p_listing_ids text[]
)
returns table (
  listing_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return;
  end if;

  return query
  select l.id
  from public.listings l
  where l.owner_id = viewer_id
    and l.id = any(coalesce(p_listing_ids, array[]::text[]));
end;
$$;

create or replace function public.can_current_user_save_listing(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null
     or safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and l.status in ('active', 'reserved')
      and l.owner_id <> viewer_id
  );
end;
$$;

create or replace function public.list_my_listings()
returns table (
  id text,
  owner_id uuid,
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return;
  end if;

  return query
  select
    l.id,
    l.owner_id,
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
  from public.listings l
  where l.owner_id = viewer_id
  order by l.created_at desc;
end;
$$;

create or replace function public.get_my_listing(
  p_listing_id text
)
returns table (
  id text,
  owner_id uuid,
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null
     or safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return;
  end if;

  return query
  select
    l.id,
    l.owner_id,
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
  from public.listings l
  where l.id = safe_listing_id
    and l.owner_id = viewer_id;
end;
$$;

revoke all on function public.current_user_owns_listing(text) from public;
revoke all on function public.current_user_owns_listing(text) from anon;
grant execute on function public.current_user_owns_listing(text) to authenticated;

revoke all on function public.list_current_user_owned_listing_ids(text[]) from public;
revoke all on function public.list_current_user_owned_listing_ids(text[]) from anon;
grant execute on function public.list_current_user_owned_listing_ids(text[]) to authenticated;

revoke all on function public.can_current_user_save_listing(text) from public;
revoke all on function public.can_current_user_save_listing(text) from anon;
grant execute on function public.can_current_user_save_listing(text) to authenticated;

revoke all on function public.list_my_listings() from public;
revoke all on function public.list_my_listings() from anon;
grant execute on function public.list_my_listings() to authenticated;

revoke all on function public.get_my_listing(text) from public;
revoke all on function public.get_my_listing(text) from anon;
grant execute on function public.get_my_listing(text) to authenticated;

create or replace function public.prepare_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_sender_id uuid;
  participant_exists boolean;
begin
  verified_sender_id := auth.uid();

  if verified_sender_id is null then
    raise exception 'Authenticated user is required to send a message';
  end if;

  new.sender_id := verified_sender_id;
  new.body := btrim(coalesce(new.body, ''));
  new.created_at := coalesce(new.created_at, now());

  if char_length(new.body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  select exists (
    select 1
    from public.conversations c
    where c.id = new.conversation_id
      and (c.buyer_id = verified_sender_id or c.seller_id = verified_sender_id)
  )
  into participant_exists;

  if not participant_exists then
    raise exception 'Conversation is unavailable';
  end if;

  if (
    select count(*)
    from public.messages m
    where m.sender_id = verified_sender_id
      and m.created_at > now() - interval '1 minute'
  ) >= 20 then
    raise exception 'Please wait before sending more messages';
  end if;

  if (
    select count(*)
    from public.messages m
    where m.sender_id = verified_sender_id
      and m.created_at > now() - interval '1 hour'
  ) >= 300 then
    raise exception 'Please wait before sending more messages';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_listing_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from public.listing_reports lr
    where lr.reporter_id = new.reporter_id
      and lr.created_at > now() - interval '15 minutes'
  ) >= 10 then
    raise exception 'Please wait before reporting more listings';
  end if;

  if (
    select count(*)
    from public.listing_reports lr
    where lr.reporter_id = new.reporter_id
      and lr.created_at > now() - interval '1 day'
  ) >= 50 then
    raise exception 'Please wait before reporting more listings';
  end if;

  return new;
end;
$$;

drop trigger if exists listing_reports_rate_limit on public.listing_reports;
create trigger listing_reports_rate_limit
before insert on public.listing_reports
for each row
execute function public.enforce_listing_report_rate_limit();

drop policy if exists "listing_images_storage_insert_owner" on storage.objects;
create policy "listing_images_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and name ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (
    select count(*)
    from storage.objects so
    where so.bucket_id = 'listing-images'
      and so.owner_id = (select auth.uid())::text
      and so.created_at > now() - interval '1 day'
  ) < 100
  and exists (
    select 1
    from public.listings l
    where l.id = (storage.foldername(name))[1]
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "profile_avatars_storage_insert_owner" on storage.objects;
create policy "profile_avatars_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and (
    select count(*)
    from storage.objects so
    where so.bucket_id = 'profile-avatars'
      and so.owner_id = (select auth.uid())::text
      and so.created_at > now() - interval '1 day'
  ) < 20
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

drop policy if exists "review_media_storage_insert_buyer" on storage.objects;
create policy "review_media_storage_insert_buyer"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'review-media'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and (
    select count(*)
    from storage.objects so
    where so.bucket_id = 'review-media'
      and so.owner_id = (select auth.uid())::text
      and so.created_at > now() - interval '1 day'
  ) < 30
  and public.current_user_owns_seller_review_path(name)
);

notify pgrst, 'reload schema';
