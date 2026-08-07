create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id text references public.listings(id) on delete set null,
  listing_title_snapshot text not null,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_display_name text not null,
  seller_display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint conversations_buyer_not_seller check (buyer_id <> seller_id),
  constraint conversations_listing_title_not_blank check (length(btrim(listing_title_snapshot)) > 0),
  constraint conversations_buyer_display_name_not_blank check (length(btrim(buyer_display_name)) > 0),
  constraint conversations_seller_display_name_not_blank check (length(btrim(seller_display_name)) > 0),
  constraint conversations_listing_title_length check (char_length(listing_title_snapshot) <= 240),
  constraint conversations_buyer_display_name_length check (char_length(buyer_display_name) <= 80),
  constraint conversations_seller_display_name_length check (char_length(seller_display_name) <= 80)
);

create unique index if not exists conversations_one_buyer_per_listing_idx
on public.conversations (listing_id, buyer_id)
where listing_id is not null;

create index if not exists conversations_buyer_id_idx
on public.conversations (buyer_id);

create index if not exists conversations_seller_id_idx
on public.conversations (seller_id);

create index if not exists conversations_last_message_at_idx
on public.conversations (last_message_at desc);

create index if not exists conversations_listing_id_idx
on public.conversations (listing_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint messages_body_not_blank check (length(btrim(body)) > 0),
  constraint messages_body_length check (char_length(body) <= 2000)
);

create index if not exists messages_conversation_id_created_at_idx
on public.messages (conversation_id, created_at);

create or replace function public.prepare_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.listing_title_snapshot := btrim(new.listing_title_snapshot);
  new.buyer_display_name := left(btrim(new.buyer_display_name), 80);
  new.seller_display_name := left(btrim(new.seller_display_name), 80);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);
  new.last_message_at := coalesce(new.last_message_at, new.created_at);

  return new;
end;
$$;

drop trigger if exists conversations_prepare_insert on public.conversations;
create trigger conversations_prepare_insert
before insert on public.conversations
for each row
execute function public.prepare_conversation_insert();

create or replace function public.prepare_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Conversation id cannot be changed';
  end if;

  if new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id then
    raise exception 'Conversation participants cannot be changed';
  end if;

  if new.listing_id is distinct from old.listing_id
    and not (old.listing_id is not null and new.listing_id is null) then
    raise exception 'Conversation listing cannot be changed';
  end if;

  if new.listing_title_snapshot <> old.listing_title_snapshot then
    raise exception 'Conversation listing snapshot cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Conversation creation time cannot be changed';
  end if;

  new.buyer_display_name := left(btrim(new.buyer_display_name), 80);
  new.seller_display_name := left(btrim(new.seller_display_name), 80);

  return new;
end;
$$;

drop trigger if exists conversations_prepare_update on public.conversations;
create trigger conversations_prepare_update
before update on public.conversations
for each row
execute function public.prepare_conversation_update();

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
  new.body := btrim(new.body);
  new.created_at := coalesce(new.created_at, now());

  if length(new.body) = 0 then
    raise exception 'Message body cannot be empty';
  end if;

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

  return new;
end;
$$;

drop trigger if exists messages_prepare_insert on public.messages;
create trigger messages_prepare_insert
before insert on public.messages
for each row
execute function public.prepare_message_insert();

create or replace function public.prevent_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Messages cannot be updated';
end;
$$;

drop trigger if exists messages_prevent_update on public.messages;
create trigger messages_prevent_update
before update on public.messages
for each row
execute function public.prevent_message_update();

create or replace function public.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row
execute function public.touch_conversation_after_message();

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

  select id, owner_id, title, seller_display_name
  into listing_record
  from public.listings
  where id = safe_listing_id;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.owner_id = verified_buyer_id then
    raise exception 'You cannot message yourself';
  end if;

  select coalesce(nullif(btrim(display_name), ''), 'Marketplace user')
  into buyer_name
  from public.profiles
  where id = verified_buyer_id;

  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(listing_record.seller_display_name), ''), 'Marketplace user')
  into seller_name
  from public.profiles
  where id = listing_record.owner_id;

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

create or replace function public.list_conversation_summaries()
returns table (
  conversation_id uuid,
  listing_id text,
  listing_title_snapshot text,
  other_participant_display_name text,
  last_message_preview text,
  last_message_at timestamptz
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
    coalesce(left(replace(m.body, E'\n', ' '), 160), '') as last_message_preview,
    c.last_message_at
  from public.conversations c
  left join lateral (
    select body
    from public.messages
    where conversation_id = c.id
    order by created_at desc
    limit 1
  ) m on true
  where c.buyer_id = viewer_id
     or c.seller_id = viewer_id
  order by c.last_message_at desc;
end;
$$;

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

  update public.conversations
  set seller_display_name = new.display_name
  where seller_id = new.id
    and seller_display_name is distinct from new.display_name;

  update public.conversations
  set buyer_display_name = new.display_name
  where buyer_id = new.id
    and buyer_display_name is distinct from new.display_name;

  return new;
end;
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon;
revoke all on public.conversations from authenticated;
revoke all on public.conversations from public;
revoke all on public.messages from anon;
revoke all on public.messages from authenticated;
revoke all on public.messages from public;

grant usage on schema public to authenticated;
grant select on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

revoke execute on function public.start_listing_conversation(text, text) from public;
revoke execute on function public.start_listing_conversation(text, text) from anon;
grant execute on function public.start_listing_conversation(text, text) to authenticated;

revoke execute on function public.list_conversation_summaries() from public;
revoke execute on function public.list_conversation_summaries() from anon;
grant execute on function public.list_conversation_summaries() to authenticated;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
on public.conversations
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
  )
);

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
    where c.id = conversation_id
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
    where c.id = conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);
