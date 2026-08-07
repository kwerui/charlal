create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_reads_user_id_idx
on public.conversation_reads (user_id);

alter table public.conversation_reads enable row level security;

revoke all on public.conversation_reads from anon;
revoke all on public.conversation_reads from authenticated;
revoke all on public.conversation_reads from public;

grant usage on schema public to authenticated;
grant select on public.conversation_reads to authenticated;

drop policy if exists "conversation_reads_select_own_participant" on public.conversation_reads;
create policy "conversation_reads_select_own_participant"
on public.conversation_reads
for select
to authenticated
using (
  (select auth.uid()) is not null
  and user_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_reads.conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  participant_exists boolean;
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

  insert into public.conversation_reads (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    p_conversation_id,
    viewer_id,
    now()
  )
  on conflict (conversation_id, user_id)
  do update set last_read_at = greatest(
    public.conversation_reads.last_read_at,
    excluded.last_read_at
  );
end;
$$;

create or replace function public.mark_sender_read_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_reads (
    conversation_id,
    user_id,
    last_read_at
  )
  values (
    new.conversation_id,
    new.sender_id,
    new.created_at
  )
  on conflict (conversation_id, user_id)
  do update set last_read_at = greatest(
    public.conversation_reads.last_read_at,
    excluded.last_read_at
  );

  return new;
end;
$$;

drop trigger if exists messages_mark_sender_read on public.messages;
create trigger messages_mark_sender_read
after insert on public.messages
for each row
execute function public.mark_sender_read_after_message();

drop function if exists public.list_conversation_summaries();

create or replace function public.list_conversation_summaries()
returns table (
  conversation_id uuid,
  listing_id text,
  listing_title_snapshot text,
  other_participant_display_name text,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint
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
    coalesce(left(replace(latest_message.body, E'\n', ' '), 160), '') as last_message_preview,
    c.last_message_at,
    coalesce(unread_messages.unread_count, 0)::bigint as unread_count
  from public.conversations c
  left join public.conversation_reads cr
    on cr.conversation_id = c.id
   and cr.user_id = viewer_id
  left join lateral (
    select msg.body
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
      and (
        cr.last_read_at is null
        or unread_msg.created_at > cr.last_read_at
      )
  ) unread_messages on true
  where c.buyer_id = viewer_id
     or c.seller_id = viewer_id
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
  where (c.buyer_id = viewer_id or c.seller_id = viewer_id)
    and exists (
      select 1
      from public.messages msg
      where msg.conversation_id = c.id
        and msg.sender_id <> viewer_id
        and (
          cr.last_read_at is null
          or msg.created_at > cr.last_read_at
        )
    );

  return coalesce(unread_conversation_count, 0);
end;
$$;

revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.mark_conversation_read(uuid) from anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

revoke execute on function public.list_conversation_summaries() from public;
revoke execute on function public.list_conversation_summaries() from anon;
grant execute on function public.list_conversation_summaries() to authenticated;

revoke execute on function public.count_unread_conversations() from public;
revoke execute on function public.count_unread_conversations() from anon;
grant execute on function public.count_unread_conversations() to authenticated;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
on public.messages
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
on public.messages
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and sender_id = (select auth.uid())
  and exists (
    select 1
    from public.conversations c
    where c.id = messages.conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);
