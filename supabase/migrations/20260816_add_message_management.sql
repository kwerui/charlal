alter table public.messages
add column if not exists edited_at timestamptz,
add column if not exists deleted_at timestamptz;

create table if not exists public.conversation_user_state (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_user_state_user_id_idx
on public.conversation_user_state (user_id);

alter table public.conversation_user_state enable row level security;

revoke all on public.conversation_user_state from anon;
revoke all on public.conversation_user_state from authenticated;
revoke all on public.conversation_user_state from public;

grant select on public.conversation_user_state to authenticated;

drop policy if exists "conversation_user_state_select_own_participant" on public.conversation_user_state;
create policy "conversation_user_state_select_own_participant"
on public.conversation_user_state
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_user_state.conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);

drop trigger if exists messages_prevent_update on public.messages;
drop trigger if exists messages_prepare_update on public.messages;

create or replace function public.prepare_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Message id cannot be changed';
  end if;

  if new.conversation_id <> old.conversation_id then
    raise exception 'Message conversation cannot be changed';
  end if;

  if new.sender_id <> old.sender_id then
    raise exception 'Message sender cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Message creation time cannot be changed';
  end if;

  if new.client_attempt_id is distinct from old.client_attempt_id then
    raise exception 'Message client attempt cannot be changed';
  end if;

  if old.deleted_at is not null then
    raise exception 'Deleted messages cannot be changed';
  end if;

  new.body := btrim(new.body);

  if length(new.body) = 0 then
    raise exception 'Message body cannot be empty';
  end if;

  if char_length(new.body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  if new.deleted_at is not null then
    new.body := '[deleted]';
    new.edited_at := old.edited_at;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;

create trigger messages_prepare_update
before update on public.messages
for each row
execute function public.prepare_message_update();

drop function if exists public.list_conversation_summaries();
create function public.list_conversation_summaries()
returns table (
  conversation_id uuid,
  listing_id text,
  listing_title_snapshot text,
  other_participant_display_name text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint,
  last_message_deleted boolean
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
    c.id as conversation_id,
    c.listing_id,
    c.listing_title_snapshot,
    case
      when c.buyer_id = viewer_id then c.seller_display_name
      else c.buyer_display_name
    end as other_participant_display_name,
    case
      when latest_message.deleted_at is not null then ''
      else coalesce(left(replace(latest_message.body, E'\n', ' '), 160), '')
    end as last_message_preview,
    c.last_message_at,
    coalesce(unread_messages.unread_count, 0)::bigint as unread_count,
    (latest_message.deleted_at is not null) as last_message_deleted
  from public.conversations c
  left join public.conversation_reads cr
    on cr.conversation_id = c.id
   and cr.user_id = viewer_id
  left join public.conversation_user_state cus
    on cus.conversation_id = c.id
   and cus.user_id = viewer_id
  left join lateral (
    select msg.body, msg.deleted_at
    from public.messages msg
    where msg.conversation_id = c.id
    order by msg.created_at desc, msg.id desc
    limit 1
  ) latest_message on true
  left join lateral (
    select count(*)::bigint as unread_count
    from public.messages unread_msg
    where unread_msg.conversation_id = c.id
      and unread_msg.sender_id <> viewer_id
      and unread_msg.deleted_at is null
      and (
        cr.last_read_at is null
        or unread_msg.created_at > cr.last_read_at
      )
  ) unread_messages on true
  where (c.buyer_id = viewer_id or c.seller_id = viewer_id)
    and (
      cus.hidden_at is null
      or exists (
        select 1
        from public.messages visible_msg
        where visible_msg.conversation_id = c.id
          and visible_msg.deleted_at is null
          and visible_msg.created_at > cus.hidden_at
      )
    )
  order by c.last_message_at desc, c.id desc;
end;
$$;

create or replace function public.count_unread_conversations()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  unread_conversation_count bigint;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return 0;
  end if;

  select count(*)::bigint
  into unread_conversation_count
  from public.conversations c
  left join public.conversation_reads cr
    on cr.conversation_id = c.id
   and cr.user_id = viewer_id
  left join public.conversation_user_state cus
    on cus.conversation_id = c.id
   and cus.user_id = viewer_id
  where (c.buyer_id = viewer_id or c.seller_id = viewer_id)
    and (
      cus.hidden_at is null
      or exists (
        select 1
        from public.messages visible_msg
        where visible_msg.conversation_id = c.id
          and visible_msg.deleted_at is null
          and visible_msg.created_at > cus.hidden_at
      )
    )
    and exists (
      select 1
      from public.messages msg
      where msg.conversation_id = c.id
        and msg.sender_id <> viewer_id
        and msg.deleted_at is null
        and (
          cr.last_read_at is null
          or msg.created_at > cr.last_read_at
        )
    );

  return coalesce(unread_conversation_count, 0);
end;
$$;

create or replace function public.get_conversation_messages(p_conversation_id uuid)
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
begin
  viewer_id := auth.uid();

  if viewer_id is null or p_conversation_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
  ) then
    return;
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
  where m.conversation_id = p_conversation_id
  order by m.created_at asc, m.id asc;
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
begin
  viewer_id := auth.uid();
  safe_body := btrim(coalesce(p_body, ''));

  if viewer_id is null then
    raise exception 'Authenticated user is required to edit a message';
  end if;

  if p_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  if length(safe_body) = 0 then
    raise exception 'Message body cannot be empty';
  end if;

  if char_length(safe_body) > 2000 then
    raise exception 'Message body is too long';
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
        and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
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

create or replace function public.delete_conversation_message(p_message_id uuid)
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
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to delete a message';
  end if;

  if p_message_id is null then
    raise exception 'Message is unavailable';
  end if;

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
        and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
    )
  returning
    m.id,
    m.conversation_id,
    m.sender_id,
    ''::text as body,
    m.created_at,
    m.client_attempt_id,
    m.edited_at,
    m.deleted_at;
end;
$$;

create or replace function public.hide_conversation_for_current_user(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null or p_conversation_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
  ) then
    return;
  end if;

  insert into public.conversation_user_state (
    conversation_id,
    user_id,
    hidden_at
  )
  values (
    p_conversation_id,
    viewer_id,
    now()
  )
  on conflict (conversation_id, user_id)
  do update set hidden_at = excluded.hidden_at;
end;
$$;

drop function if exists public.send_conversation_message(uuid, text, uuid);
create function public.send_conversation_message(
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
  participant_exists boolean;
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

  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.buyer_id = verified_sender_id
        or c.seller_id = verified_sender_id
      )
  )
  into participant_exists;

  if not participant_exists then
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

  return query
  with inserted_message as (
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
    returning
      inserted_message_row.id,
      inserted_message_row.conversation_id,
      inserted_message_row.sender_id,
      inserted_message_row.body,
      inserted_message_row.created_at,
      inserted_message_row.client_attempt_id,
      inserted_message_row.edited_at,
      inserted_message_row.deleted_at
  ),
  resolved_message as (
    select
      im.id,
      im.conversation_id,
      im.sender_id,
      im.body,
      im.created_at,
      im.client_attempt_id,
      im.edited_at,
      im.deleted_at
    from inserted_message im
    union all
    select
      em.id,
      em.conversation_id,
      em.sender_id,
      case when em.deleted_at is null then em.body else '' end as body,
      em.created_at,
      em.client_attempt_id,
      em.edited_at,
      em.deleted_at
    from public.messages em
    where em.conversation_id = p_conversation_id
      and em.sender_id = verified_sender_id
      and em.client_attempt_id = p_client_attempt_id
      and not exists (
        select 1
        from inserted_message im
      )
  )
  select
    rm.id,
    rm.conversation_id,
    rm.sender_id,
    rm.body,
    rm.created_at,
    rm.client_attempt_id,
    rm.edited_at,
    rm.deleted_at
  from resolved_message rm
  order by rm.created_at asc, rm.id asc
  limit 1;
end;
$$;

grant select on public.conversation_user_state to authenticated;

revoke execute on function public.prepare_message_update() from public;
revoke execute on function public.prepare_message_update() from anon;

revoke execute on function public.list_conversation_summaries() from public;
revoke execute on function public.list_conversation_summaries() from anon;
grant execute on function public.list_conversation_summaries() to authenticated;

revoke execute on function public.count_unread_conversations() from public;
revoke execute on function public.count_unread_conversations() from anon;
grant execute on function public.count_unread_conversations() to authenticated;

revoke execute on function public.get_conversation_messages(uuid) from public;
revoke execute on function public.get_conversation_messages(uuid) from anon;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

revoke execute on function public.edit_conversation_message(uuid, text) from public;
revoke execute on function public.edit_conversation_message(uuid, text) from anon;
grant execute on function public.edit_conversation_message(uuid, text) to authenticated;

revoke execute on function public.delete_conversation_message(uuid) from public;
revoke execute on function public.delete_conversation_message(uuid) from anon;
grant execute on function public.delete_conversation_message(uuid) to authenticated;

revoke execute on function public.hide_conversation_for_current_user(uuid) from public;
revoke execute on function public.hide_conversation_for_current_user(uuid) from anon;
grant execute on function public.hide_conversation_for_current_user(uuid) to authenticated;

revoke execute on function public.send_conversation_message(uuid, text, uuid) from public;
revoke execute on function public.send_conversation_message(uuid, text, uuid) from anon;
grant execute on function public.send_conversation_message(uuid, text, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_user_state'
  ) then
    alter publication supabase_realtime add table public.conversation_user_state;
  end if;
end;
$$;

notify pgrst, 'reload schema';
