begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create table if not exists private.user_moderation (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'normal',
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null,
  constraint user_moderation_state_valid check (state in ('normal', 'suspended'))
);

create index if not exists user_moderation_state_changed_idx
on private.user_moderation (state, changed_at desc);

alter table private.user_moderation enable row level security;

revoke all on private.user_moderation from anon;
revoke all on private.user_moderation from authenticated;
revoke all on private.user_moderation from public;

create table if not exists private.user_moderation_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  target_user_id uuid not null,
  action text not null,
  previous_state text not null,
  new_state text not null,
  created_at timestamptz not null default now(),
  constraint user_moderation_audit_action_valid
    check (action in ('user_suspended', 'user_restored')),
  constraint user_moderation_audit_previous_state_valid
    check (previous_state in ('normal', 'suspended')),
  constraint user_moderation_audit_new_state_valid
    check (new_state in ('normal', 'suspended'))
);

create index if not exists user_moderation_audit_target_created_idx
on private.user_moderation_audit_events (target_user_id, created_at desc);

create index if not exists user_moderation_audit_actor_created_idx
on private.user_moderation_audit_events (actor_id, created_at desc);

alter table private.user_moderation_audit_events enable row level security;

revoke all on private.user_moderation_audit_events from anon;
revoke all on private.user_moderation_audit_events from authenticated;
revoke all on private.user_moderation_audit_events from public;

create or replace function private.user_is_suspended(p_user_id uuid)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from private.user_moderation um
    where um.user_id = p_user_id
      and um.state = 'suspended'
  );
end;
$$;

create or replace function public.current_user_is_suspended()
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return false;
  end if;

  return exists (
    select 1
    from private.user_moderation um
    where um.user_id = viewer_id
      and um.state = 'suspended'
  );
end;
$$;

create or replace function public.listing_is_publicly_visible(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  safe_listing_id text;
begin
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and l.moderation_state = 'normal'
      and l.status in ('active', 'reserved')
      and not private.user_is_suspended(l.owner_id)
  );
end;
$$;

create or replace function private.current_user_can_message_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null or p_conversation_id is null then
    return false;
  end if;

  if private.user_is_suspended(viewer_id) then
    return false;
  end if;

  return exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
      and not private.user_is_suspended(c.buyer_id)
      and not private.user_is_suspended(c.seller_id)
  );
end;
$$;

create or replace function public.current_user_can_message_conversation(
  p_conversation_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  return private.current_user_can_message_conversation(p_conversation_id);
end;
$$;

create or replace function public.admin_get_user_moderation_state(
  p_user_id uuid
)
returns table (
  user_id uuid,
  state text,
  changed_at timestamptz,
  changed_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  return query
  select
    p_user_id,
    coalesce(um.state, 'normal') as state,
    um.changed_at,
    um.changed_by
  from (select p_user_id as user_id) target
  left join private.user_moderation um
    on um.user_id = target.user_id;
end;
$$;

create or replace function public.suspend_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  target_user_id uuid;
  previous_state text;
begin
  actor_id := auth.uid();
  target_user_id := p_user_id;

  -- Lock order for role-stable moderation actions:
  -- private.user_roles table, target advisory lock, target auth.users row,
  -- target private.user_moderation row.
  lock table private.user_roles in share row exclusive mode;

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if target_user_id is null then
    raise exception 'User is required';
  end if;

  if target_user_id = actor_id then
    raise exception 'Admin cannot suspend themselves';
  end if;

  if exists (
    select 1
    from private.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = 'admin'
  ) then
    raise exception 'Admin users cannot be suspended';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  perform 1
  from auth.users u
  where u.id = target_user_id
  for update;

  if not found then
    raise exception 'User is unavailable';
  end if;

  select coalesce(um.state, 'normal')
  into previous_state
  from private.user_moderation um
  where um.user_id = target_user_id
  for update;

  previous_state := coalesce(previous_state, 'normal');

  if previous_state = 'suspended' then
    return;
  end if;

  insert into private.user_moderation (
    user_id,
    state,
    changed_at,
    changed_by
  )
  values (
    target_user_id,
    'suspended',
    now(),
    actor_id
  )
  on conflict (user_id)
  do update set
    state = excluded.state,
    changed_at = excluded.changed_at,
    changed_by = excluded.changed_by;

  insert into private.user_moderation_audit_events (
    actor_id,
    target_user_id,
    action,
    previous_state,
    new_state
  )
  values (
    actor_id,
    target_user_id,
    'user_suspended',
    previous_state,
    'suspended'
  );
end;
$$;

create or replace function public.restore_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  target_user_id uuid;
  previous_state text;
begin
  actor_id := auth.uid();
  target_user_id := p_user_id;

  -- Lock order for role-stable moderation actions:
  -- private.user_roles table, target advisory lock, target auth.users row,
  -- target private.user_moderation row.
  lock table private.user_roles in share row exclusive mode;

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if target_user_id is null then
    raise exception 'User is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  perform 1
  from auth.users u
  where u.id = target_user_id
  for update;

  if not found then
    raise exception 'User is unavailable';
  end if;

  select coalesce(um.state, 'normal')
  into previous_state
  from private.user_moderation um
  where um.user_id = target_user_id
  for update;

  previous_state := coalesce(previous_state, 'normal');

  if previous_state = 'normal' then
    return;
  end if;

  insert into private.user_moderation (
    user_id,
    state,
    changed_at,
    changed_by
  )
  values (
    target_user_id,
    'normal',
    now(),
    actor_id
  )
  on conflict (user_id)
  do update set
    state = excluded.state,
    changed_at = excluded.changed_at,
    changed_by = excluded.changed_by;

  insert into private.user_moderation_audit_events (
    actor_id,
    target_user_id,
    action,
    previous_state,
    new_state
  )
  values (
    actor_id,
    target_user_id,
    'user_restored',
    previous_state,
    'normal'
  );
end;
$$;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings
for select
to anon, authenticated
using (
  (
    public.listing_is_publicly_visible(id)
  )
  or (
    (select auth.uid()) is not null
    and owner_id = (select auth.uid())
  )
);

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own"
on public.listings
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and (select auth.uid()) = owner_id
);

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own"
on public.listings
for update
to authenticated
using (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and (select auth.uid()) = owner_id
)
with check (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and (select auth.uid()) = owner_id
);

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own"
on public.listings
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and (select auth.uid()) = owner_id
);

create or replace function public.prepare_listing_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_owner_id uuid;
  profile_name text;
begin
  verified_owner_id := auth.uid();

  if verified_owner_id is null then
    raise exception 'Authenticated user is required to create a listing';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot create listings';
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
  new.moderation_state := coalesce(new.moderation_state, 'normal');
  new.status := coalesce(new.status, 'active');

  if new.id = '' then
    new.id := 'db-' || gen_random_uuid()::text;
  end if;

  return new;
end;
$$;

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
  if auth.uid() = old.owner_id and public.current_user_is_suspended() then
    raise exception 'Suspended users cannot update listings';
  end if;

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
  new.moderation_state := coalesce(new.moderation_state, old.moderation_state, 'normal');

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

drop policy if exists "listing_images_insert_owner" on public.listing_images;
create policy "listing_images_insert_owner"
on public.listing_images
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and public.current_user_owns_listing(listing_id)
);

drop policy if exists "listing_images_update_owner" on public.listing_images;
create policy "listing_images_update_owner"
on public.listing_images
for update
to authenticated
using (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and public.current_user_owns_listing(listing_id)
)
with check (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and public.current_user_owns_listing(listing_id)
);

drop policy if exists "listing_images_delete_owner" on public.listing_images;
create policy "listing_images_delete_owner"
on public.listing_images
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and public.current_user_owns_listing(listing_id)
);

create or replace function public.prepare_listing_image_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_count integer;
begin
  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot update listing images';
  end if;

  new.storage_path := btrim(new.storage_path);
  new.created_at := coalesce(new.created_at, now());

  select count(*)
  into image_count
  from public.listing_images li
  where li.listing_id = new.listing_id;

  if image_count >= 8 then
    raise exception 'A listing can have at most 8 images';
  end if;

  return new;
end;
$$;

drop policy if exists "listing_images_select_public" on public.listing_images;
create policy "listing_images_select_public"
on public.listing_images
for select
to anon, authenticated
using (
  public.can_current_user_view_listing_image_metadata(listing_images.listing_id)
);

create or replace function public.can_current_user_view_listing_image_metadata(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and (
        (
          l.moderation_state = 'normal'
          and l.status in ('active', 'reserved')
          and not private.user_is_suspended(l.owner_id)
        )
        or (
          viewer_id is not null
          and l.owner_id = viewer_id
        )
      )
  );
end;
$$;

create or replace function public.get_public_seller_profile(p_public_slug text)
returns table (
  public_slug text,
  display_name text,
  bio text,
  location text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint,
  member_since timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.public_slug,
    p.display_name,
    p.bio,
    p.location,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom,
    p.created_at as member_since
  from public.profiles p
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
    and not private.user_is_suspended(p.id)
  limit 1
$$;

create or replace function public.list_public_seller_listings(p_public_slug text)
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
stable
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
    and not private.user_is_suspended(p.id)
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
  order by l.created_at desc, l.id desc
$$;

create or replace function public.get_listing_public_seller_slug(p_listing_id text)
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select p.public_slug
  from public.listings l
  join public.profiles p
    on p.id = l.owner_id
  where l.id = btrim(p_listing_id)
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
    and not private.user_is_suspended(l.owner_id)
  limit 1
$$;

create or replace function public.get_listing_public_seller_profile(p_listing_id text)
returns table (
  public_slug text,
  display_name text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.public_slug,
    p.display_name,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom
  from public.listings l
  join public.profiles p
    on p.id = l.owner_id
  where l.id = btrim(p_listing_id)
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
    and not private.user_is_suspended(l.owner_id)
  limit 1
$$;

create or replace function public.report_listing(
  p_listing_id text,
  p_reason text,
  p_details text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
  safe_reason text;
  safe_details text;
  listing_record record;
  report_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to report a listing';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot report listings';
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));
  safe_reason := btrim(coalesce(p_reason, ''));
  safe_details := nullif(btrim(coalesce(p_details, '')), '');

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    raise exception 'Listing is unavailable';
  end if;

  if safe_reason not in (
    'scam',
    'prohibited_item',
    'misleading',
    'duplicate_spam',
    'other'
  ) then
    raise exception 'Report reason is required';
  end if;

  if safe_details is not null and char_length(safe_details) > 1000 then
    raise exception 'Report details are too long';
  end if;

  select l.id, l.owner_id, l.title
  into listing_record
  from public.listings l
  where l.id = safe_listing_id
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
    and not private.user_is_suspended(l.owner_id);

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.owner_id = viewer_id then
    raise exception 'You cannot report your own listing';
  end if;

  if exists (
    select 1
    from public.listing_reports lr
    where lr.reporter_id = viewer_id
      and lr.listing_reference = listing_record.id
      and lr.state = 'open'
  ) then
    return 'already_reported';
  end if;

  begin
    insert into public.listing_reports (
      reporter_id,
      seller_id,
      listing_id,
      listing_reference,
      listing_title_snapshot,
      reason,
      details
    )
    values (
      viewer_id,
      listing_record.owner_id,
      listing_record.id,
      listing_record.id,
      btrim(listing_record.title),
      safe_reason,
      safe_details
    )
    returning id into report_id;
  exception
    when unique_violation then
      return 'already_reported';
  end;

  if report_id is null then
    return 'already_reported';
  end if;

  return 'created';
end;
$$;

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

  if private.user_is_suspended(verified_buyer_id) then
    raise exception 'Suspended users cannot start conversations';
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
  where l.id = safe_listing_id
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
    and not private.user_is_suspended(l.owner_id);

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if private.user_is_suspended(listing_record.owner_id) then
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

create or replace function public.can_current_user_save_listing(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null
     or public.current_user_is_suspended()
     or safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and l.status in ('active', 'reserved')
      and l.moderation_state = 'normal'
      and not private.user_is_suspended(l.owner_id)
      and l.owner_id <> viewer_id
  );
end;
$$;

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

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot save listings';
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
      and l.moderation_state = 'normal'
      and not private.user_is_suspended(l.owner_id)
      and l.owner_id <> viewer_id
  )
  into database_listing_is_saveable;

  if not database_listing_is_saveable then
    raise exception 'Listing cannot be saved';
  end if;

  return new;
end;
$$;

drop policy if exists "listing_favorites_insert_own" on public.listing_favorites;
create policy "listing_favorites_insert_own"
on public.listing_favorites
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and not public.current_user_is_suspended()
  and listing_source = 'database'
);

drop policy if exists "listing_favorites_delete_own" on public.listing_favorites;
create policy "listing_favorites_delete_own"
on public.listing_favorites
for delete
to authenticated
using (
  user_id = (select auth.uid())
);

create or replace function public.record_completed_listing_sale(
  p_listing_id text,
  p_buyer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
  listing_record record;
  existing_transaction record;
  transaction_id uuid;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null then
    raise exception 'Authenticated user is required to mark a sale';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot mark sales';
  end if;

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    raise exception 'Listing is unavailable';
  end if;

  if p_buyer_id is null then
    raise exception 'Buyer is required';
  end if;

  select
    l.id,
    l.owner_id,
    l.title,
    l.category,
    l.subcategory
  into listing_record
  from public.listings l
  where l.id = safe_listing_id;

  if not found or listing_record.owner_id <> viewer_id then
    raise exception 'Only the listing seller can record this sale';
  end if;

  if p_buyer_id = viewer_id then
    raise exception 'Seller cannot be the buyer';
  end if;

  if private.user_is_suspended(p_buyer_id) then
    raise exception 'Buyer is unavailable';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = safe_listing_id
      and c.seller_id = viewer_id
      and c.buyer_id = p_buyer_id
      and exists (
        select 1
        from public.messages m
        where m.conversation_id = c.id
      )
  ) then
    raise exception 'Buyer must have messaged about this listing';
  end if;

  select clt.id, clt.buyer_id
  into existing_transaction
  from public.completed_listing_transactions clt
  where clt.listing_id = safe_listing_id
  limit 1;

  if found then
    if existing_transaction.buyer_id <> p_buyer_id then
      raise exception 'This listing already has a recorded Charlal buyer';
    end if;

    update public.listings
    set status = 'sold'
    where id = safe_listing_id
      and owner_id = viewer_id;

    return existing_transaction.id;
  end if;

  update public.listings
  set status = 'sold'
  where id = safe_listing_id
    and owner_id = viewer_id;

  insert into public.completed_listing_transactions (
    seller_id,
    buyer_id,
    listing_id,
    listing_title_snapshot,
    listing_category_snapshot,
    listing_subcategory_snapshot
  )
  values (
    viewer_id,
    p_buyer_id,
    safe_listing_id,
    listing_record.title,
    listing_record.category,
    listing_record.subcategory
  )
  returning id into transaction_id;

  return transaction_id;
end;
$$;

create or replace function public.prepare_seller_review_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_buyer_id uuid;
  transaction_record record;
begin
  verified_buyer_id := auth.uid();

  if verified_buyer_id is null then
    raise exception 'Authenticated user is required to leave a review';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot leave reviews';
  end if;

  select clt.seller_id, clt.buyer_id
  into transaction_record
  from public.completed_listing_transactions clt
  where clt.id = new.transaction_id;

  if not found then
    raise exception 'Purchase is unavailable';
  end if;

  if transaction_record.buyer_id <> verified_buyer_id then
    raise exception 'Only the buyer can review this purchase';
  end if;

  if transaction_record.seller_id = verified_buyer_id then
    raise exception 'You cannot review yourself';
  end if;

  new.seller_id := transaction_record.seller_id;
  new.buyer_id := transaction_record.buyer_id;
  new.tags := coalesce(new.tags, array[]::text[]);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  return new;
end;
$$;

create or replace function public.prepare_seller_review_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot update reviews';
  end if;

  if new.id <> old.id then
    raise exception 'Review id cannot be changed';
  end if;

  if new.transaction_id <> old.transaction_id then
    raise exception 'Review purchase cannot be changed';
  end if;

  if new.seller_id <> old.seller_id
     or new.buyer_id <> old.buyer_id then
    raise exception 'Review participants cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Review creation time cannot be changed';
  end if;

  new.tags := coalesce(new.tags, array[]::text[]);

  if new.rating is distinct from old.rating
     or new.tags is distinct from old.tags then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

drop policy if exists "seller_reviews_insert_buyer" on public.seller_reviews;
create policy "seller_reviews_insert_buyer"
on public.seller_reviews
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and exists (
    select 1
    from public.completed_listing_transactions clt
    where clt.id = seller_reviews.transaction_id
      and clt.buyer_id = (select auth.uid())
      and clt.seller_id <> (select auth.uid())
  )
);

drop policy if exists "seller_reviews_update_buyer" on public.seller_reviews;
create policy "seller_reviews_update_buyer"
on public.seller_reviews
for update
to authenticated
using (
  buyer_id = (select auth.uid())
  and not public.current_user_is_suspended()
)
with check (
  buyer_id = (select auth.uid())
  and not public.current_user_is_suspended()
);

create or replace function public.delete_own_seller_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to delete a review';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot delete reviews';
  end if;

  delete from public.seller_reviews sr
  where sr.id = p_review_id
    and sr.buyer_id = viewer_id;
end;
$$;

create or replace function public.get_seller_review_summary(
  p_public_slug text
)
returns table (
  average_rating numeric,
  review_count bigint
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    round(avg(sr.rating)::numeric, 1) as average_rating,
    count(sr.id)::bigint as review_count
  from public.profiles p
  left join public.seller_reviews sr
    on sr.seller_id = p.id
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
    and not private.user_is_suspended(p.id)
  group by p.id
$$;

create or replace function public.list_public_seller_reviews(
  p_public_slug text,
  p_limit integer default 50
)
returns table (
  review_id uuid,
  rating smallint,
  review_tags text[],
  review_created_at timestamptz,
  review_updated_at timestamptz,
  listing_title_snapshot text,
  completed_at timestamptz,
  buyer_display_name text,
  buyer_public_slug text,
  buyer_avatar_path text,
  buyer_avatar_focus_x smallint,
  buyer_avatar_focus_y smallint,
  buyer_avatar_zoom smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer;
begin
  safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  return query
  select
    sr.id,
    sr.rating,
    coalesce(sr.tags, array[]::text[]) as review_tags,
    sr.created_at,
    sr.updated_at,
    clt.listing_title_snapshot,
    clt.completed_at,
    coalesce(nullif(btrim(bp.display_name), ''), 'Marketplace user')::text,
    bp.public_slug,
    bp.avatar_path,
    bp.avatar_focus_x,
    bp.avatar_focus_y,
    bp.avatar_zoom
  from public.profiles sp
  join public.seller_reviews sr
    on sr.seller_id = sp.id
  join public.completed_listing_transactions clt
    on clt.id = sr.transaction_id
  join public.profiles bp
    on bp.id = sr.buyer_id
  where sp.public_slug = btrim(p_public_slug)
    and sp.public_slug ~ '^seller-[a-f0-9]{32}$'
    and not private.user_is_suspended(sp.id)
  order by sr.created_at desc, sr.id desc
  limit safe_limit;
end;
$$;

create or replace function public.prepare_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_sender_id uuid;
begin
  verified_sender_id := auth.uid();

  if verified_sender_id is null then
    raise exception 'Authenticated user is required to send a message';
  end if;

  if not private.current_user_can_message_conversation(new.conversation_id) then
    raise exception 'Conversation is unavailable';
  end if;

  new.sender_id := verified_sender_id;
  new.body := btrim(coalesce(new.body, ''));
  new.created_at := coalesce(new.created_at, now());

  if char_length(new.body) > 2000 then
    raise exception 'Message body is too long';
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

drop function if exists public.send_conversation_message(uuid, text, uuid);
create or replace function public.send_conversation_message(
  p_conversation_id uuid,
  p_body text,
  p_client_attempt_id uuid
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  client_attempt_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_sender_id uuid;
  safe_body text;
  inserted_message_id uuid;
begin
  verified_sender_id := auth.uid();
  safe_body := btrim(coalesce(p_body, ''));

  if verified_sender_id is null then
    raise exception 'Authenticated user is required to send a message';
  end if;

  if p_conversation_id is null then
    raise exception 'Conversation is unavailable';
  end if;

  if length(safe_body) = 0 then
    raise exception 'Message body cannot be empty';
  end if;

  if char_length(safe_body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  if not private.current_user_can_message_conversation(p_conversation_id) then
    raise exception 'Conversation is unavailable';
  end if;

  if p_client_attempt_id is null then
    return query
    insert into public.messages as inserted_message_row (
      conversation_id,
      body
    )
    values (
      p_conversation_id,
      safe_body
    )
    returning
      inserted_message_row.id,
      inserted_message_row.conversation_id,
      inserted_message_row.sender_id,
      inserted_message_row.body,
      inserted_message_row.created_at,
      inserted_message_row.client_attempt_id,
      inserted_message_row.edited_at,
      inserted_message_row.deleted_at;

    return;
  end if;

  insert into public.messages as inserted_message_row (
    conversation_id,
    body,
    client_attempt_id
  )
  values (
    p_conversation_id,
    safe_body,
    p_client_attempt_id
  )
  on conflict do nothing
  returning inserted_message_row.id
  into inserted_message_id;

  if inserted_message_id is null then
    select m.id
    into inserted_message_id
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = verified_sender_id
      and m.client_attempt_id = p_client_attempt_id
    order by m.created_at asc, m.id asc
    limit 1;
  end if;

  if inserted_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    case when m.deleted_at is null then m.body else '' end as body,
    m.created_at,
    m.client_attempt_id,
    m.edited_at,
    m.deleted_at
  from public.messages m
  where m.id = inserted_message_id;
end;
$$;

create or replace function public.send_conversation_message_with_attachments(
  p_conversation_id uuid,
  p_body text,
  p_client_attempt_id uuid,
  p_attachments jsonb
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  client_attempt_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_sender_id uuid;
  safe_body text;
  attachment_items jsonb;
  attachment_count integer;
  existing_message_id uuid;
  inserted_message_id uuid;
  attachment_record record;
  safe_storage_path text;
  safe_content_type text;
  safe_extension text;
  storage_object_exists boolean;
begin
  verified_sender_id := auth.uid();
  safe_body := btrim(coalesce(p_body, ''));
  attachment_items := coalesce(p_attachments, '[]'::jsonb);

  if verified_sender_id is null then
    raise exception 'Authenticated user is required to send a message';
  end if;

  if p_conversation_id is null then
    raise exception 'Conversation is unavailable';
  end if;

  if not private.current_user_can_message_conversation(p_conversation_id) then
    raise exception 'Conversation is unavailable';
  end if;

  if p_client_attempt_id is null then
    raise exception 'Message attachment attempt is unavailable';
  end if;

  if jsonb_typeof(attachment_items) <> 'array' then
    raise exception 'Message attachments are invalid';
  end if;

  attachment_count := jsonb_array_length(attachment_items);

  if attachment_count = 0 then
    raise exception 'Message attachment is required';
  end if;

  if attachment_count > 4 then
    raise exception 'A message can have at most 4 attachments';
  end if;

  if char_length(safe_body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  select m.id
  into existing_message_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id = verified_sender_id
    and m.client_attempt_id = p_client_attempt_id
  order by m.created_at asc, m.id asc
  limit 1;

  if existing_message_id is not null then
    return query
    select
      m.id,
      m.conversation_id,
      m.sender_id,
      case when m.deleted_at is null then m.body else '' end as body,
      m.created_at,
      m.client_attempt_id,
      m.edited_at,
      m.deleted_at
    from public.messages m
    where m.id = existing_message_id;

    return;
  end if;

  for attachment_record in
    select
      item.value ->> 'storage_path' as storage_path,
      item.value ->> 'content_type' as content_type
    from jsonb_array_elements(attachment_items)
      with ordinality as item(value, ordinality)
    order by item.ordinality
  loop
    safe_storage_path := btrim(coalesce(attachment_record.storage_path, ''));
    safe_content_type := btrim(coalesce(attachment_record.content_type, ''));
    safe_extension := lower(
      split_part(
        safe_storage_path,
        '.',
        array_length(string_to_array(safe_storage_path, '.'), 1)
      )
    );

    if safe_storage_path !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    then
      raise exception 'Message attachment path is invalid';
    end if;

    if split_part(safe_storage_path, '/', 1) <> p_conversation_id::text then
      raise exception 'Message attachment path is invalid';
    end if;

    if split_part(safe_storage_path, '/', 2) <> p_client_attempt_id::text then
      raise exception 'Message attachment path is invalid';
    end if;

    if safe_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
      raise exception 'Message attachment type is invalid';
    end if;

    if (
      safe_content_type = 'image/jpeg'
      and safe_extension not in ('jpg', 'jpeg')
    ) or (
      safe_content_type = 'image/png'
      and safe_extension <> 'png'
    ) or (
      safe_content_type = 'image/webp'
      and safe_extension <> 'webp'
    ) then
      raise exception 'Message attachment type is invalid';
    end if;

    select exists (
      select 1
      from storage.objects so
      where so.bucket_id = 'message-attachments'
        and so.name = safe_storage_path
        and so.owner_id = verified_sender_id::text
    )
    into storage_object_exists;

    if not storage_object_exists then
      raise exception 'Message attachment is unavailable';
    end if;
  end loop;

  insert into public.messages as inserted_message_row (
    conversation_id,
    body,
    client_attempt_id
  )
  values (
    p_conversation_id,
    safe_body,
    p_client_attempt_id
  )
  on conflict do nothing
  returning inserted_message_row.id
  into inserted_message_id;

  if inserted_message_id is null then
    select m.id
    into inserted_message_id
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.sender_id = verified_sender_id
      and m.client_attempt_id = p_client_attempt_id
    order by m.created_at asc, m.id asc
    limit 1;
  else
    insert into public.message_attachments (
      message_id,
      storage_path,
      position,
      content_type
    )
    select
      inserted_message_id,
      btrim(item.value ->> 'storage_path'),
      (item.ordinality - 1)::smallint,
      btrim(item.value ->> 'content_type')
    from jsonb_array_elements(attachment_items)
      with ordinality as item(value, ordinality)
    order by item.ordinality;
  end if;

  if inserted_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    case when m.deleted_at is null then m.body else '' end as body,
    m.created_at,
    m.client_attempt_id,
    m.edited_at,
    m.deleted_at
  from public.messages m
  where m.id = inserted_message_id;
end;
$$;

create or replace function public.edit_conversation_message(
  p_message_id uuid,
  p_body text
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  client_attempt_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_body text;
  message_has_attachments boolean;
begin
  viewer_id := auth.uid();
  safe_body := btrim(coalesce(p_body, ''));

  if viewer_id is null then
    raise exception 'Authenticated user is required to edit a message';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot edit messages';
  end if;

  if p_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  if char_length(safe_body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  select exists (
    select 1
    from public.message_attachments ma
    where ma.message_id = p_message_id
  )
  into message_has_attachments;

  if length(safe_body) = 0
     and not message_has_attachments then
    raise exception 'Message body cannot be empty';
  end if;

  return query
  update public.messages m
  set body = safe_body
  where m.id = p_message_id
    and m.sender_id = viewer_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.conversations c
      where c.id = m.conversation_id
        and (
          c.buyer_id = viewer_id
          or c.seller_id = viewer_id
        )
    )
  returning
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.created_at,
    m.client_attempt_id,
    m.edited_at,
    m.deleted_at;
end;
$$;

create or replace function public.delete_conversation_message_with_attachments(
  p_message_id uuid
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz,
  client_attempt_id uuid,
  edited_at timestamptz,
  deleted_at timestamptz,
  attachment_paths text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_attachment_paths text[];
  deleted_message_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to delete a message';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot delete messages';
  end if;

  if p_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  select coalesce(
    array_agg(ma.storage_path order by ma.position, ma.created_at),
    array[]::text[]
  )
  into safe_attachment_paths
  from public.message_attachments ma
  join public.messages m
    on m.id = ma.message_id
  join public.conversations c
    on c.id = m.conversation_id
  where m.id = p_message_id
    and m.sender_id = viewer_id
    and m.deleted_at is null
    and (
      c.buyer_id = viewer_id
      or c.seller_id = viewer_id
    );

  return query
  update public.messages m
  set deleted_at = now()
  where m.id = p_message_id
    and m.sender_id = viewer_id
    and m.deleted_at is null
    and exists (
      select 1
      from public.conversations c
      where c.id = m.conversation_id
        and (
          c.buyer_id = viewer_id
          or c.seller_id = viewer_id
        )
    )
  returning
    m.id,
    m.conversation_id,
    m.sender_id,
    ''::text as body,
    m.created_at,
    m.client_attempt_id,
    m.edited_at,
    m.deleted_at,
    safe_attachment_paths as attachment_paths;

  select m.id
  into deleted_message_id
  from public.messages m
  where m.id = p_message_id
    and m.sender_id = viewer_id
    and m.deleted_at is not null;

  if deleted_message_id is not null then
    delete from public.message_attachments ma
    where ma.message_id = deleted_message_id;
  end if;
end;
$$;

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
on public.messages
for insert
to authenticated
with check (
  public.current_user_can_message_conversation(conversation_id)
);

create or replace function public.set_current_profile_avatar(
  p_avatar_path text,
  p_avatar_focus_x integer,
  p_avatar_focus_y integer,
  p_avatar_zoom integer
)
returns table (
  public_slug text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint,
  previous_avatar_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  profile_record record;
  safe_avatar_path text;
  safe_focus_x smallint;
  safe_focus_y smallint;
  safe_zoom smallint;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to update a profile avatar';
  end if;

  if public.current_user_is_suspended() then
    raise exception 'Suspended users cannot update profile avatar';
  end if;

  safe_avatar_path := nullif(btrim(coalesce(p_avatar_path, '')), '');
  safe_focus_x := least(100, greatest(0, coalesce(p_avatar_focus_x, 50)))::smallint;
  safe_focus_y := least(100, greatest(0, coalesce(p_avatar_focus_y, 50)))::smallint;
  safe_zoom := least(300, greatest(100, coalesce(p_avatar_zoom, 100)))::smallint;

  select
    p.public_slug,
    p.avatar_path
  into profile_record
  from public.profiles p
  where p.id = viewer_id;

  if not found then
    raise exception 'Profile is unavailable';
  end if;

  if safe_avatar_path is not null then
    if safe_avatar_path !~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
      raise exception 'Avatar path is invalid';
    end if;

    if split_part(safe_avatar_path, '/', 1) <> profile_record.public_slug then
      raise exception 'Avatar path does not belong to this profile';
    end if;
  end if;

  update public.profiles p
  set
    avatar_path = safe_avatar_path,
    avatar_focus_x = safe_focus_x,
    avatar_focus_y = safe_focus_y,
    avatar_zoom = safe_zoom
  where p.id = viewer_id;

  return query
  select
    profile_record.public_slug::text,
    safe_avatar_path::text,
    safe_focus_x,
    safe_focus_y,
    safe_zoom,
    profile_record.avatar_path::text;
end;
$$;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (
  (select auth.uid()) = id
  and not public.current_user_is_suspended()
)
with check (
  (select auth.uid()) = id
  and not public.current_user_is_suspended()
);

drop policy if exists "listing_images_storage_insert_owner" on storage.objects;
create policy "listing_images_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and name ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and private.current_user_storage_uploads_below_limit('listing-images')
  and public.current_user_owns_listing((storage.foldername(name))[1])
);

drop policy if exists "listing_images_storage_delete_owner" on storage.objects;
create policy "listing_images_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and array_length(storage.foldername(name), 1) = 1
  and public.current_user_owns_listing((storage.foldername(name))[1])
);

drop policy if exists "profile_avatars_storage_insert_owner" on storage.objects;
create policy "profile_avatars_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and private.current_user_storage_uploads_below_limit('profile-avatars')
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

drop policy if exists "profile_avatars_storage_delete_owner" on storage.objects;
create policy "profile_avatars_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and not public.current_user_is_suspended()
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

drop policy if exists "message_attachments_storage_insert_participant"
on storage.objects;

create policy "message_attachments_storage_insert_participant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and array_length(storage.foldername(name), 1) = 2
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and private.current_user_message_attachment_uploads_below_limit()
  and public.current_user_can_message_conversation((storage.foldername(name))[1]::uuid)
);

drop policy if exists "message_attachments_storage_delete_owner"
on storage.objects;

create policy "message_attachments_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-attachments'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and array_length(storage.foldername(name), 1) = 2
  and not public.current_user_is_suspended()
  and exists (
    select 1
    from public.conversations c
    where c.id = (storage.foldername(name))[1]::uuid
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);

alter function private.user_is_suspended(uuid)
owner to postgres;
alter function public.current_user_is_suspended()
owner to postgres;
alter function public.listing_is_publicly_visible(text)
owner to postgres;
alter function private.current_user_can_message_conversation(uuid)
owner to postgres;
alter function public.current_user_can_message_conversation(uuid)
owner to postgres;
alter function public.admin_get_user_moderation_state(uuid)
owner to postgres;
alter function public.suspend_user(uuid)
owner to postgres;
alter function public.restore_user(uuid)
owner to postgres;
alter function public.prepare_listing_insert()
owner to postgres;
alter function public.prepare_listing_update()
owner to postgres;
alter function public.prepare_listing_image_insert()
owner to postgres;
alter function public.can_current_user_view_listing_image_metadata(text)
owner to postgres;
alter function public.get_public_seller_profile(text)
owner to postgres;
alter function public.list_public_seller_listings(text)
owner to postgres;
alter function public.get_listing_public_seller_slug(text)
owner to postgres;
alter function public.get_listing_public_seller_profile(text)
owner to postgres;
alter function public.report_listing(text, text, text)
owner to postgres;
alter function public.start_listing_conversation(text, text)
owner to postgres;
alter function public.can_current_user_save_listing(text)
owner to postgres;
alter function public.prepare_listing_favorite_write()
owner to postgres;
alter function public.record_completed_listing_sale(text, uuid)
owner to postgres;
alter function public.prepare_seller_review_insert()
owner to postgres;
alter function public.prepare_seller_review_update()
owner to postgres;
alter function public.delete_own_seller_review(uuid)
owner to postgres;
alter function public.get_seller_review_summary(text)
owner to postgres;
alter function public.list_public_seller_reviews(text, integer)
owner to postgres;
alter function public.prepare_message_insert()
owner to postgres;
alter function public.send_conversation_message(uuid, text, uuid)
owner to postgres;
alter function public.send_conversation_message_with_attachments(uuid, text, uuid, jsonb)
owner to postgres;
alter function public.edit_conversation_message(uuid, text)
owner to postgres;
alter function public.delete_conversation_message_with_attachments(uuid)
owner to postgres;
alter function public.set_current_profile_avatar(text, integer, integer, integer)
owner to postgres;

revoke all on function private.user_is_suspended(uuid) from public;
revoke all on function private.user_is_suspended(uuid) from anon;
revoke all on function private.user_is_suspended(uuid) from authenticated;

revoke all on function public.current_user_is_suspended() from public;
revoke all on function public.current_user_is_suspended() from anon;
grant execute on function public.current_user_is_suspended() to authenticated;

revoke all on function public.listing_is_publicly_visible(text) from public;
grant execute on function public.listing_is_publicly_visible(text) to anon, authenticated;

revoke all on function private.current_user_can_message_conversation(uuid) from public;
revoke all on function private.current_user_can_message_conversation(uuid) from anon;
revoke all on function private.current_user_can_message_conversation(uuid) from authenticated;

revoke all on function public.current_user_can_message_conversation(uuid) from public;
revoke all on function public.current_user_can_message_conversation(uuid) from anon;
grant execute on function public.current_user_can_message_conversation(uuid) to authenticated;

revoke all on function public.admin_get_user_moderation_state(uuid) from public;
revoke all on function public.admin_get_user_moderation_state(uuid) from anon;
grant execute on function public.admin_get_user_moderation_state(uuid) to authenticated;

revoke all on function public.suspend_user(uuid) from public;
revoke all on function public.suspend_user(uuid) from anon;
grant execute on function public.suspend_user(uuid) to authenticated;

revoke all on function public.restore_user(uuid) from public;
revoke all on function public.restore_user(uuid) from anon;
grant execute on function public.restore_user(uuid) to authenticated;

revoke all on function public.can_current_user_view_listing_image_metadata(text) from public;
revoke all on function public.can_current_user_view_listing_image_metadata(text) from anon;
revoke all on function public.can_current_user_view_listing_image_metadata(text) from authenticated;
grant execute on function public.can_current_user_view_listing_image_metadata(text) to anon, authenticated;

revoke all on function public.get_public_seller_profile(text) from public;
revoke all on function public.get_public_seller_profile(text) from anon;
grant execute on function public.get_public_seller_profile(text) to anon, authenticated;

revoke all on function public.list_public_seller_listings(text) from public;
revoke all on function public.list_public_seller_listings(text) from anon;
grant execute on function public.list_public_seller_listings(text) to anon, authenticated;

revoke all on function public.get_listing_public_seller_slug(text) from public;
revoke all on function public.get_listing_public_seller_slug(text) from anon;
grant execute on function public.get_listing_public_seller_slug(text) to anon, authenticated;

revoke all on function public.get_listing_public_seller_profile(text) from public;
revoke all on function public.get_listing_public_seller_profile(text) from anon;
grant execute on function public.get_listing_public_seller_profile(text) to anon, authenticated;

revoke all on function public.report_listing(text, text, text) from public;
revoke all on function public.report_listing(text, text, text) from anon;
grant execute on function public.report_listing(text, text, text) to authenticated;

revoke all on function public.start_listing_conversation(text, text) from public;
revoke all on function public.start_listing_conversation(text, text) from anon;
grant execute on function public.start_listing_conversation(text, text) to authenticated;

revoke all on function public.can_current_user_save_listing(text) from public;
revoke all on function public.can_current_user_save_listing(text) from anon;
grant execute on function public.can_current_user_save_listing(text) to authenticated;

revoke all on function public.record_completed_listing_sale(text, uuid) from public;
revoke all on function public.record_completed_listing_sale(text, uuid) from anon;
grant execute on function public.record_completed_listing_sale(text, uuid) to authenticated;

revoke all on function public.delete_own_seller_review(uuid) from public;
revoke all on function public.delete_own_seller_review(uuid) from anon;
grant execute on function public.delete_own_seller_review(uuid) to authenticated;

revoke all on function public.get_seller_review_summary(text) from public;
revoke all on function public.get_seller_review_summary(text) from anon;
grant execute on function public.get_seller_review_summary(text) to anon, authenticated;

revoke all on function public.list_public_seller_reviews(text, integer) from public;
revoke all on function public.list_public_seller_reviews(text, integer) from anon;
grant execute on function public.list_public_seller_reviews(text, integer) to anon, authenticated;

revoke execute on function public.send_conversation_message(uuid, text, uuid) from public;
revoke execute on function public.send_conversation_message(uuid, text, uuid) from anon;
grant execute on function public.send_conversation_message(uuid, text, uuid) to authenticated;

revoke execute on function public.send_conversation_message_with_attachments(uuid, text, uuid, jsonb) from public;
revoke execute on function public.send_conversation_message_with_attachments(uuid, text, uuid, jsonb) from anon;
grant execute on function public.send_conversation_message_with_attachments(uuid, text, uuid, jsonb) to authenticated;

revoke execute on function public.edit_conversation_message(uuid, text) from public;
revoke execute on function public.edit_conversation_message(uuid, text) from anon;
grant execute on function public.edit_conversation_message(uuid, text) to authenticated;

revoke execute on function public.delete_conversation_message_with_attachments(uuid) from public;
revoke execute on function public.delete_conversation_message_with_attachments(uuid) from anon;
grant execute on function public.delete_conversation_message_with_attachments(uuid) to authenticated;

revoke all on function public.set_current_profile_avatar(text, integer, integer, integer) from public;
revoke all on function public.set_current_profile_avatar(text, integer, integer, integer) from anon;
grant execute on function public.set_current_profile_avatar(text, integer, integer, integer) to authenticated;

notify pgrst, 'reload schema';

commit;
