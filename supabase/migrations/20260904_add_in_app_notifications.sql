begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  review_id uuid references public.seller_reviews(id) on delete cascade,
  listing_id text,
  listing_title_snapshot text,
  old_listing_status text,
  new_listing_status text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_valid check (
    type in (
      'message_received',
      'review_received',
      'saved_listing_status_changed'
    )
  ),
  constraint notifications_listing_statuses_valid check (
    (
      old_listing_status is null
      and new_listing_status is null
    )
    or (
      old_listing_status in ('active', 'reserved', 'sold', 'archived')
      and new_listing_status in ('active', 'reserved', 'sold', 'archived')
    )
  ),
  constraint notifications_type_references_valid check (
    (
      type = 'message_received'
      and conversation_id is not null
      and message_id is not null
      and review_id is null
      and listing_id is null
      and listing_title_snapshot is null
      and old_listing_status is null
      and new_listing_status is null
    )
    or (
      type = 'review_received'
      and conversation_id is null
      and message_id is null
      and review_id is not null
      and listing_id is null
      and listing_title_snapshot is null
      and old_listing_status is null
      and new_listing_status is null
    )
    or (
      type = 'saved_listing_status_changed'
      and conversation_id is null
      and message_id is null
      and review_id is null
      and listing_id is not null
      and listing_title_snapshot is not null
      and length(btrim(listing_title_snapshot)) > 0
      and old_listing_status is not null
      and new_listing_status is not null
      and old_listing_status <> new_listing_status
    )
  )
);

create index if not exists notifications_user_created_at_idx
on public.notifications (user_id, created_at desc, id desc);

create index if not exists notifications_user_unread_idx
on public.notifications (user_id, created_at desc)
where read_at is null;

create unique index if not exists notifications_message_conversation_unique_idx
on public.notifications (user_id, type, conversation_id)
where type = 'message_received' and conversation_id is not null;

create unique index if not exists notifications_review_unique_idx
on public.notifications (user_id, type, review_id)
where type = 'review_received' and review_id is not null;

alter table public.notifications enable row level security;

revoke all on public.notifications from anon;
revoke all on public.notifications from authenticated;
revoke all on public.notifications from public;

grant select on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
);

create or replace function public.create_message_received_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation_record record;
  recipient_id uuid;
begin
  select c.buyer_id, c.seller_id
  into conversation_record
  from public.conversations c
  where c.id = new.conversation_id;

  if not found then
    return new;
  end if;

  recipient_id := case
    when new.sender_id = conversation_record.buyer_id then conversation_record.seller_id
    when new.sender_id = conversation_record.seller_id then conversation_record.buyer_id
    else null
  end;

  if recipient_id is null or recipient_id = new.sender_id then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    actor_id,
    conversation_id,
    message_id,
    read_at,
    created_at
  )
  values (
    recipient_id,
    'message_received',
    new.sender_id,
    new.conversation_id,
    new.id,
    null,
    new.created_at
  )
  on conflict (user_id, type, conversation_id)
  where type = 'message_received' and conversation_id is not null
  do update set
    actor_id = excluded.actor_id,
    message_id = excluded.message_id,
    read_at = null,
    created_at = greatest(public.notifications.created_at, excluded.created_at);

  return new;
end;
$$;

drop trigger if exists messages_create_message_received_notification
on public.messages;

create trigger messages_create_message_received_notification
after insert on public.messages
for each row
execute function public.create_message_received_notification();

create or replace function public.create_review_received_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.seller_id is null
     or new.buyer_id is null
     or new.seller_id = new.buyer_id then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    actor_id,
    review_id,
    read_at,
    created_at
  )
  values (
    new.seller_id,
    'review_received',
    new.buyer_id,
    new.id,
    null,
    new.created_at
  )
  on conflict (user_id, type, review_id)
  where type = 'review_received' and review_id is not null
  do nothing;

  return new;
end;
$$;

drop trigger if exists seller_reviews_create_review_received_notification
on public.seller_reviews;

create trigger seller_reviews_create_review_received_notification
after insert on public.seller_reviews
for each row
execute function public.create_review_received_notification();

create or replace function public.listing_status_is_saveable(
  p_status text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('active', 'reserved')
$$;

create or replace function public.create_saved_listing_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if public.listing_status_is_saveable(new.status)
     = public.listing_status_is_saveable(old.status) then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    type,
    actor_id,
    listing_id,
    listing_title_snapshot,
    old_listing_status,
    new_listing_status,
    read_at,
    created_at
  )
  select
    lf.user_id,
    'saved_listing_status_changed',
    new.owner_id,
    new.id,
    left(btrim(new.title), 240),
    old.status,
    new.status,
    null,
    now()
  from public.listing_favorites lf
  where lf.listing_source = 'database'
    and lf.listing_id = new.id
    and lf.user_id <> new.owner_id;

  return new;
end;
$$;

drop trigger if exists listings_create_saved_listing_status_notifications
on public.listings;

create trigger listings_create_saved_listing_status_notifications
after update of status on public.listings
for each row
execute function public.create_saved_listing_status_notifications();

create or replace function public.list_my_notifications(
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  notification_id uuid,
  notification_type text,
  actor_display_name text,
  conversation_id uuid,
  conversation_title text,
  review_id uuid,
  review_listing_title text,
  listing_id text,
  listing_title text,
  old_listing_status text,
  new_listing_status text,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_limit integer;
  safe_offset integer;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return;
  end if;

  safe_limit := greatest(1, least(coalesce(p_limit, 30), 50));
  safe_offset := greatest(0, coalesce(p_offset, 0));

  return query
  select
    n.id,
    n.type,
    nullif(btrim(p.display_name), '')::text,
    n.conversation_id,
    c.listing_title_snapshot,
    n.review_id,
    clt.listing_title_snapshot,
    n.listing_id,
    coalesce(l.title, n.listing_title_snapshot),
    n.old_listing_status,
    n.new_listing_status,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p
    on p.id = n.actor_id
  left join public.conversations c
    on c.id = n.conversation_id
  left join public.seller_reviews sr
    on sr.id = n.review_id
  left join public.completed_listing_transactions clt
    on clt.id = sr.transaction_id
  left join public.listings l
    on l.id = n.listing_id
  where n.user_id = viewer_id
  order by n.created_at desc, n.id desc
  limit safe_limit
  offset safe_offset;
end;
$$;

create or replace function public.count_unread_notifications()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  unread_notification_count bigint;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return 0;
  end if;

  select count(*)::bigint
  into unread_notification_count
  from public.notifications n
  where n.user_id = viewer_id
    and n.read_at is null;

  return coalesce(unread_notification_count, 0);
end;
$$;

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null or p_notification_id is null then
    return;
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = viewer_id;
end;
$$;

create or replace function public.mark_all_notifications_read()
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
    return;
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.user_id = viewer_id
    and n.read_at is null;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  participant_exists boolean;
  read_boundary timestamptz;
begin
  viewer_id := auth.uid();

  if viewer_id is null or p_conversation_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
  )
  into participant_exists;

  if not participant_exists then
    return;
  end if;

  read_boundary := now();

  insert into public.conversation_reads (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    p_conversation_id,
    viewer_id,
    read_boundary
  )
  on conflict (conversation_id, user_id)
  do update set last_read_at = greatest(
    public.conversation_reads.last_read_at,
    excluded.last_read_at
  );

  update public.notifications n
  set read_at = coalesce(n.read_at, read_boundary)
  where n.user_id = viewer_id
    and n.type = 'message_received'
    and n.conversation_id = p_conversation_id
    and exists (
      select 1
      from public.messages m
      where m.id = n.message_id
        and m.conversation_id = p_conversation_id
        and m.sender_id <> viewer_id
        and m.created_at <= read_boundary
    )
    and n.read_at is null;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

revoke all on function public.create_message_received_notification() from public;
revoke all on function public.create_message_received_notification() from anon;
revoke all on function public.create_message_received_notification() from authenticated;

revoke all on function public.create_review_received_notification() from public;
revoke all on function public.create_review_received_notification() from anon;
revoke all on function public.create_review_received_notification() from authenticated;

revoke all on function public.create_saved_listing_status_notifications() from public;
revoke all on function public.create_saved_listing_status_notifications() from anon;
revoke all on function public.create_saved_listing_status_notifications() from authenticated;

revoke all on function public.listing_status_is_saveable(text) from public;
grant execute on function public.listing_status_is_saveable(text)
to anon, authenticated, service_role;

revoke all on function public.list_my_notifications(integer, integer) from public;
revoke all on function public.list_my_notifications(integer, integer) from anon;
grant execute on function public.list_my_notifications(integer, integer)
to authenticated;

revoke all on function public.count_unread_notifications() from public;
revoke all on function public.count_unread_notifications() from anon;
grant execute on function public.count_unread_notifications()
to authenticated;

revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_notification_read(uuid) from anon;
grant execute on function public.mark_notification_read(uuid)
to authenticated;

revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.mark_all_notifications_read() from anon;
grant execute on function public.mark_all_notifications_read()
to authenticated;

revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.mark_conversation_read(uuid) from anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
