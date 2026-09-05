begin;

create schema if not exists private;

create table if not exists private.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role),
  constraint user_roles_role_valid check (role in ('admin'))
);

alter table private.user_roles enable row level security;

revoke all on private.user_roles from anon;
revoke all on private.user_roles from authenticated;
revoke all on private.user_roles from public;

alter table public.listings
add column if not exists moderation_state text not null default 'normal';

alter table public.listings
drop constraint if exists listings_moderation_state_check;

alter table public.listings
add constraint listings_moderation_state_check
check (moderation_state in ('normal', 'hidden'));

create index if not exists listings_public_moderation_status_created_idx
on public.listings (moderation_state, status, created_at desc);

grant select (moderation_state) on public.listings to anon, authenticated;

alter table public.listing_reports
add column if not exists state text not null default 'open',
add column if not exists reviewed_at timestamptz,
add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.listing_reports
drop constraint if exists listing_reports_state_valid;

alter table public.listing_reports
add constraint listing_reports_state_valid
check (state in ('open', 'dismissed', 'listing_hidden'));

create index if not exists listing_reports_state_created_idx
on public.listing_reports (state, created_at desc);

create index if not exists listing_reports_listing_reference_state_idx
on public.listing_reports (listing_reference, state, created_at desc);

drop index if exists public.listing_reports_one_per_listing_reference_idx;

create unique index if not exists listing_reports_one_open_per_listing_reference_idx
on public.listing_reports (reporter_id, listing_reference)
where state = 'open';

create table if not exists private.moderation_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  listing_id text not null,
  related_report_id uuid,
  previous_moderation_state text not null,
  new_moderation_state text not null,
  created_at timestamptz not null default now(),
  constraint moderation_audit_events_action_valid check (
    action in (
      'report_dismissed',
      'report_reopened',
      'listing_hidden',
      'listing_restored'
    )
  ),
  constraint moderation_audit_events_previous_state_valid check (
    previous_moderation_state in ('normal', 'hidden')
  ),
  constraint moderation_audit_events_new_state_valid check (
    new_moderation_state in ('normal', 'hidden')
  ),
  constraint moderation_audit_events_listing_id_not_blank check (
    length(btrim(listing_id)) > 0
  )
);

create index if not exists moderation_audit_events_listing_created_idx
on private.moderation_audit_events (listing_id, created_at desc);

create index if not exists moderation_audit_events_actor_created_idx
on private.moderation_audit_events (actor_id, created_at desc);

alter table private.moderation_audit_events enable row level security;

revoke all on private.moderation_audit_events from anon;
revoke all on private.moderation_audit_events from authenticated;
revoke all on private.moderation_audit_events from public;

drop policy if exists "listings_select_public" on public.listings;
create policy "listings_select_public"
on public.listings
for select
to anon, authenticated
using (
  (
    moderation_state = 'normal'
    and status in ('active', 'reserved')
  )
  or (
    (select auth.uid()) is not null
    and owner_id = (select auth.uid())
  )
);

create or replace function public.can_current_user_view_listing_image_metadata(
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
        )
        or (
          viewer_id is not null
          and l.owner_id = viewer_id
        )
      )
  );
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

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
security definer
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
    from private.user_roles ur
    where ur.user_id = viewer_id
      and ur.role = 'admin'
  );
end;
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
    and l.moderation_state = 'normal';

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

create or replace function public.has_reported_listing(
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

  if viewer_id is null then
    return false;
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listing_reports lr
    where lr.reporter_id = viewer_id
      and lr.listing_reference = safe_listing_id
      and lr.state = 'open'
  );
end;
$$;

drop function if exists public.list_public_seller_listings(text);
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
    and l.moderation_state = 'normal'
  order by l.created_at desc, l.id desc
$$;

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
    and l.status in ('active', 'reserved')
    and l.moderation_state = 'normal'
  limit 1
$$;

drop function if exists public.get_listing_public_seller_profile(text);
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
  limit 1
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
    and l.moderation_state = 'normal';

  if not found then
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
      and l.moderation_state = 'normal'
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
      and l.owner_id <> viewer_id
  )
  into database_listing_is_saveable;

  if not database_listing_is_saveable then
    raise exception 'Listing cannot be saved';
  end if;

  return new;
end;
$$;

drop function if exists public.list_my_listings();
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
  moderation_state text,
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
    l.moderation_state,
    l.created_at,
    l.updated_at
  from public.listings l
  where l.owner_id = viewer_id
  order by l.created_at desc;
end;
$$;

drop function if exists public.get_my_listing(text);
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
  moderation_state text,
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
    l.moderation_state,
    l.created_at,
    l.updated_at
  from public.listings l
  where l.id = safe_listing_id
    and l.owner_id = viewer_id;
end;
$$;

create or replace function public.list_admin_listing_reports(
  p_state text default 'open',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  report_id uuid,
  report_state text,
  report_reason text,
  report_details text,
  report_created_at timestamptz,
  reviewed_at timestamptz,
  listing_id text,
  listing_reference text,
  listing_title text,
  listing_title_snapshot text,
  listing_status text,
  listing_moderation_state text,
  reporter_id uuid,
  reporter_display_name text,
  seller_id uuid,
  seller_display_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_state text;
  safe_limit integer;
  safe_offset integer;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  safe_state := btrim(coalesce(p_state, 'open'));
  safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));
  safe_offset := greatest(0, coalesce(p_offset, 0));

  if safe_state not in ('open', 'dismissed', 'listing_hidden', 'all') then
    safe_state := 'open';
  end if;

  return query
  select
    lr.id,
    lr.state,
    lr.reason,
    lr.details,
    lr.created_at,
    lr.reviewed_at,
    l.id,
    lr.listing_reference,
    l.title,
    lr.listing_title_snapshot,
    l.status,
    l.moderation_state,
    lr.reporter_id,
    nullif(btrim(reporter.display_name), ''),
    lr.seller_id,
    coalesce(nullif(btrim(seller.display_name), ''), nullif(btrim(l.seller_display_name), ''))
  from public.listing_reports lr
  left join public.listings l
    on l.id = lr.listing_reference
  left join public.profiles reporter
    on reporter.id = lr.reporter_id
  left join public.profiles seller
    on seller.id = lr.seller_id
  where safe_state = 'all'
    or lr.state = safe_state
  order by lr.created_at desc, lr.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

create or replace function public.dismiss_listing_report(
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  report_record record;
  listing_state text;
begin
  actor_id := auth.uid();

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if p_report_id is null then
    raise exception 'Report is required';
  end if;

  select lr.id, lr.state, lr.listing_reference
  into report_record
  from public.listing_reports lr
  where lr.id = p_report_id
  for update;

  if not found then
    raise exception 'Report is unavailable';
  end if;

  select coalesce(l.moderation_state, 'normal')
  into listing_state
  from public.listings l
  where l.id = report_record.listing_reference;

  listing_state := coalesce(listing_state, 'normal');

  if report_record.state <> 'open' then
    raise exception 'Report is already resolved';
  end if;

  update public.listing_reports lr
  set
    state = 'dismissed',
    reviewed_at = now(),
    reviewed_by = actor_id
  where lr.id = report_record.id;

  insert into private.moderation_audit_events (
    actor_id,
    action,
    listing_id,
    related_report_id,
    previous_moderation_state,
    new_moderation_state
  )
  values (
    actor_id,
    'report_dismissed',
    report_record.listing_reference,
    report_record.id,
    listing_state,
    listing_state
  );
end;
$$;

create or replace function public.reopen_listing_report(
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  report_record record;
  listing_state text;
begin
  actor_id := auth.uid();

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if p_report_id is null then
    raise exception 'Report is required';
  end if;

  select lr.id, lr.state, lr.listing_reference, lr.reporter_id
  into report_record
  from public.listing_reports lr
  where lr.id = p_report_id
  for update;

  if not found then
    raise exception 'Report is unavailable';
  end if;

  if report_record.state <> 'dismissed' then
    raise exception 'Report cannot be reopened';
  end if;

  if exists (
    select 1
    from public.listing_reports lr
    where lr.reporter_id = report_record.reporter_id
      and lr.listing_reference = report_record.listing_reference
      and lr.state = 'open'
      and lr.id <> report_record.id
  ) then
    raise exception 'Reporter already has an open report for this listing';
  end if;

  select coalesce(l.moderation_state, 'normal')
  into listing_state
  from public.listings l
  where l.id = report_record.listing_reference;

  listing_state := coalesce(listing_state, 'normal');

  update public.listing_reports lr
  set
    state = 'open',
    reviewed_at = null,
    reviewed_by = null
  where lr.id = report_record.id;

  insert into private.moderation_audit_events (
    actor_id,
    action,
    listing_id,
    related_report_id,
    previous_moderation_state,
    new_moderation_state
  )
  values (
    actor_id,
    'report_reopened',
    report_record.listing_reference,
    report_record.id,
    listing_state,
    listing_state
  );
end;
$$;

create or replace function public.hide_listing_from_report(
  p_report_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  report_record record;
  listing_record record;
begin
  actor_id := auth.uid();

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  if p_report_id is null then
    raise exception 'Report is required';
  end if;

  select lr.id, lr.state, lr.listing_reference
  into report_record
  from public.listing_reports lr
  where lr.id = p_report_id;

  if not found then
    raise exception 'Report is unavailable';
  end if;

  if report_record.state <> 'open' then
    raise exception 'Report is already resolved';
  end if;

  select l.id, l.moderation_state
  into listing_record
  from public.listings l
  where l.id = report_record.listing_reference
  for update;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.moderation_state <> 'normal' then
    raise exception 'Listing cannot be hidden';
  end if;

  select lr.id, lr.state, lr.listing_reference
  into report_record
  from public.listing_reports lr
  where lr.id = p_report_id
  for update;

  if not found then
    raise exception 'Report is unavailable';
  end if;

  if report_record.state <> 'open' then
    raise exception 'Report is already resolved';
  end if;

  update public.listings l
  set moderation_state = 'hidden'
  where l.id = listing_record.id
    and l.moderation_state = 'normal';

  update public.listing_reports lr
  set
    state = 'listing_hidden',
    reviewed_at = now(),
    reviewed_by = actor_id
  where lr.listing_reference = report_record.listing_reference
    and lr.state = 'open';

  insert into private.moderation_audit_events (
    actor_id,
    action,
    listing_id,
    related_report_id,
    previous_moderation_state,
    new_moderation_state
  )
  values (
    actor_id,
    'listing_hidden',
    listing_record.id,
    report_record.id,
    listing_record.moderation_state,
    'hidden'
  );
end;
$$;

create or replace function public.restore_hidden_listing(
  p_listing_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  safe_listing_id text;
  listing_record record;
begin
  actor_id := auth.uid();

  if actor_id is null or not public.current_user_is_admin() then
    raise exception 'Admin access is required';
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    raise exception 'Listing is unavailable';
  end if;

  select l.id, l.moderation_state
  into listing_record
  from public.listings l
  where l.id = safe_listing_id
  for update;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.moderation_state <> 'hidden' then
    raise exception 'Listing is not hidden';
  end if;

  update public.listings l
  set moderation_state = 'normal'
  where l.id = listing_record.id;

  insert into private.moderation_audit_events (
    actor_id,
    action,
    listing_id,
    related_report_id,
    previous_moderation_state,
    new_moderation_state
  )
  values (
    actor_id,
    'listing_restored',
    listing_record.id,
    null,
    listing_record.moderation_state,
    'normal'
  );
end;
$$;

alter function public.current_user_is_admin()
owner to postgres;
alter function public.can_current_user_view_listing_image_metadata(text)
owner to postgres;
alter function public.report_listing(text, text, text)
owner to postgres;
alter function public.has_reported_listing(text)
owner to postgres;
alter function public.list_public_seller_listings(text)
owner to postgres;
alter function public.get_listing_public_seller_slug(text)
owner to postgres;
alter function public.get_listing_public_seller_profile(text)
owner to postgres;
alter function public.start_listing_conversation(text, text)
owner to postgres;
alter function public.can_current_user_save_listing(text)
owner to postgres;
alter function public.prepare_listing_favorite_write()
owner to postgres;
alter function public.list_my_listings()
owner to postgres;
alter function public.get_my_listing(text)
owner to postgres;
alter function public.list_admin_listing_reports(text, integer, integer)
owner to postgres;
alter function public.dismiss_listing_report(uuid)
owner to postgres;
alter function public.reopen_listing_report(uuid)
owner to postgres;
alter function public.hide_listing_from_report(uuid)
owner to postgres;
alter function public.restore_hidden_listing(text)
owner to postgres;

revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_is_admin() from anon;
grant execute on function public.current_user_is_admin() to authenticated;

revoke all on function public.can_current_user_view_listing_image_metadata(text) from public;
revoke all on function public.can_current_user_view_listing_image_metadata(text) from anon;
revoke all on function public.can_current_user_view_listing_image_metadata(text) from authenticated;
grant execute on function public.can_current_user_view_listing_image_metadata(text) to anon, authenticated;

revoke all on function public.report_listing(text, text, text) from public;
revoke all on function public.report_listing(text, text, text) from anon;
grant execute on function public.report_listing(text, text, text) to authenticated;

revoke all on function public.has_reported_listing(text) from public;
revoke all on function public.has_reported_listing(text) from anon;
grant execute on function public.has_reported_listing(text) to authenticated;

revoke all on function public.list_public_seller_listings(text) from public;
revoke all on function public.list_public_seller_listings(text) from anon;
grant execute on function public.list_public_seller_listings(text) to anon, authenticated;

revoke all on function public.get_listing_public_seller_slug(text) from public;
revoke all on function public.get_listing_public_seller_slug(text) from anon;
grant execute on function public.get_listing_public_seller_slug(text) to anon, authenticated;

revoke all on function public.get_listing_public_seller_profile(text) from public;
revoke all on function public.get_listing_public_seller_profile(text) from anon;
grant execute on function public.get_listing_public_seller_profile(text) to anon, authenticated;

revoke all on function public.start_listing_conversation(text, text) from public;
revoke all on function public.start_listing_conversation(text, text) from anon;
grant execute on function public.start_listing_conversation(text, text) to authenticated;

revoke all on function public.can_current_user_save_listing(text) from public;
revoke all on function public.can_current_user_save_listing(text) from anon;
grant execute on function public.can_current_user_save_listing(text) to authenticated;

revoke all on function public.prepare_listing_favorite_write() from public;
revoke all on function public.prepare_listing_favorite_write() from anon;
revoke all on function public.prepare_listing_favorite_write() from authenticated;

revoke all on function public.list_my_listings() from public;
revoke all on function public.list_my_listings() from anon;
grant execute on function public.list_my_listings() to authenticated;

revoke all on function public.get_my_listing(text) from public;
revoke all on function public.get_my_listing(text) from anon;
grant execute on function public.get_my_listing(text) to authenticated;

revoke all on function public.list_admin_listing_reports(text, integer, integer) from public;
revoke all on function public.list_admin_listing_reports(text, integer, integer) from anon;
grant execute on function public.list_admin_listing_reports(text, integer, integer) to authenticated;

revoke all on function public.dismiss_listing_report(uuid) from public;
revoke all on function public.dismiss_listing_report(uuid) from anon;
grant execute on function public.dismiss_listing_report(uuid) to authenticated;

revoke all on function public.reopen_listing_report(uuid) from public;
revoke all on function public.reopen_listing_report(uuid) from anon;
grant execute on function public.reopen_listing_report(uuid) to authenticated;

revoke all on function public.hide_listing_from_report(uuid) from public;
revoke all on function public.hide_listing_from_report(uuid) from anon;
grant execute on function public.hide_listing_from_report(uuid) to authenticated;

revoke all on function public.restore_hidden_listing(text) from public;
revoke all on function public.restore_hidden_listing(text) from anon;
grant execute on function public.restore_hidden_listing(text) to authenticated;

notify pgrst, 'reload schema';

commit;
