insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-attachments',
  'message-attachments',
  false,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


alter table public.messages
drop constraint if exists messages_body_not_blank;


create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null,
  content_type text not null,
  created_at timestamptz not null default now(),

  constraint message_attachments_storage_path_not_blank
    check (length(btrim(storage_path)) > 0),

  constraint message_attachments_position_range
    check (position >= 0 and position < 4),

  constraint message_attachments_content_type
    check (
      content_type in (
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),

  constraint message_attachments_path_shape
    check (
      storage_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    ),

  constraint message_attachments_position_unique
    unique (message_id, position)
);


create index if not exists message_attachments_message_id_position_idx
on public.message_attachments (
  message_id,
  position,
  created_at
);


alter table public.message_attachments enable row level security;


revoke all on public.message_attachments from anon;
revoke all on public.message_attachments from authenticated;
revoke all on public.message_attachments from public;

grant select on public.message_attachments to authenticated;


drop policy if exists "message_attachments_select_participant"
on public.message_attachments;

create policy "message_attachments_select_participant"
on public.message_attachments
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.messages m
    join public.conversations c
      on c.id = m.conversation_id
    where m.id = message_attachments.message_id
      and m.deleted_at is null
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);


revoke insert on public.messages from authenticated;


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
      and (
        c.buyer_id = verified_sender_id
        or c.seller_id = verified_sender_id
      )
  )
  into participant_exists;

  if not participant_exists then
    raise exception 'Conversation is unavailable';
  end if;

  return new;
end;
$$;


create or replace function public.prepare_message_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment_exists boolean;
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

  new.body := btrim(coalesce(new.body, ''));

  if new.deleted_at is not null then
    new.body := '';
    new.edited_at := old.edited_at;
    return new;
  end if;

  if char_length(new.body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  if length(new.body) = 0 then
    select exists (
      select 1
      from public.message_attachments ma
      where ma.message_id = old.id
    )
    into attachment_exists;

    if not attachment_exists then
      raise exception 'Message body cannot be empty';
    end if;
  end if;

  if new.body is distinct from old.body then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;

  return new;
end;
$$;


create or replace function public.prevent_message_attachment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Message attachments cannot be changed';
end;
$$;


drop trigger if exists message_attachments_prevent_update
on public.message_attachments;

create trigger message_attachments_prevent_update
before update on public.message_attachments
for each row
execute function public.prevent_message_attachment_update();


create or replace function public.prepare_message_attachment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attachment_count integer;
begin
  new.storage_path := btrim(new.storage_path);
  new.created_at := coalesce(new.created_at, now());

  select count(*)
  into attachment_count
  from public.message_attachments ma
  where ma.message_id = new.message_id;

  if attachment_count >= 4 then
    raise exception 'A message can have at most 4 attachments';
  end if;

  return new;
end;
$$;


drop trigger if exists message_attachments_prepare_insert
on public.message_attachments;

create trigger message_attachments_prepare_insert
before insert on public.message_attachments
for each row
execute function public.prepare_message_attachment_insert();


drop function if exists public.list_conversation_summaries();


create function public.list_conversation_summaries()
returns table (
  conversation_id uuid,
  listing_id text,
  listing_title_snapshot text,
  other_participant_display_name text,
  other_participant_public_slug text,
  other_participant_avatar_path text,
  other_participant_avatar_focus_x smallint,
  other_participant_avatar_focus_y smallint,
  other_participant_avatar_zoom smallint,
  last_message_preview text,
  last_message_at timestamptz,
  unread_count bigint,
  last_message_deleted boolean,
  last_message_attachment_count bigint
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
    p.display_name as other_participant_display_name,
    p.public_slug as other_participant_public_slug,
    p.avatar_path as other_participant_avatar_path,
    p.avatar_focus_x as other_participant_avatar_focus_x,
    p.avatar_focus_y as other_participant_avatar_focus_y,
    p.avatar_zoom as other_participant_avatar_zoom,

    case
      when latest_message.deleted_at is not null then ''
      else coalesce(
        left(
          replace(latest_message.body, E'\n', ' '),
          160
        ),
        ''
      )
    end as last_message_preview,

    c.last_message_at,

    coalesce(
      unread_messages.unread_count,
      0
    )::bigint as unread_count,

    (
      latest_message.deleted_at is not null
    ) as last_message_deleted,

    coalesce(
      latest_message.attachment_count,
      0
    )::bigint as last_message_attachment_count

  from public.conversations c

  join public.profiles p
    on p.id = case
      when c.buyer_id = viewer_id then c.seller_id
      else c.buyer_id
    end

  left join public.conversation_reads cr
    on cr.conversation_id = c.id
   and cr.user_id = viewer_id

  left join public.conversation_user_state cus
    on cus.conversation_id = c.id
   and cus.user_id = viewer_id

  left join lateral (
    select
      msg.body,
      msg.deleted_at,
      (
        select count(*)::bigint
        from public.message_attachments ma
        where ma.message_id = msg.id
      ) as attachment_count
    from public.messages msg
    where msg.conversation_id = c.id
    order by
      msg.created_at desc,
      msg.id desc
    limit 1
  ) latest_message on true

  left join lateral (
    select
      count(*)::bigint as unread_count
    from public.messages unread_msg
    where unread_msg.conversation_id = c.id
      and unread_msg.sender_id <> viewer_id
      and unread_msg.deleted_at is null
      and (
        cr.last_read_at is null
        or unread_msg.created_at > cr.last_read_at
      )
  ) unread_messages on true

  where (
    c.buyer_id = viewer_id
    or c.seller_id = viewer_id
  )
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

  order by
    c.last_message_at desc,
    c.id desc;
end;
$$;


create or replace function public.get_message_attachments(
  p_conversation_id uuid
)
returns table (
  id uuid,
  message_id uuid,
  storage_path text,
  "position" smallint,
  content_type text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null
     or p_conversation_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.buyer_id = viewer_id
        or c.seller_id = viewer_id
      )
  ) then
    return;
  end if;

  return query
  select
    ma.id,
    ma.message_id,
    ma.storage_path,
    ma.position,
    ma.content_type,
    ma.created_at
  from public.message_attachments ma
  join public.messages m
    on m.id = ma.message_id
  where m.conversation_id = p_conversation_id
    and m.deleted_at is null
  order by
    m.created_at asc,
    m.id asc,
    ma.position asc,
    ma.created_at asc;
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
  attachment_items := coalesce(
    p_attachments,
    '[]'::jsonb
  );

  if verified_sender_id is null then
    raise exception 'Authenticated user is required to send a message';
  end if;

  if p_conversation_id is null then
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

  if length(safe_body) = 0
     and attachment_count = 0 then
    raise exception 'Message body cannot be empty';
  end if;

  if char_length(safe_body) > 2000 then
    raise exception 'Message body is too long';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.buyer_id = verified_sender_id
        or c.seller_id = verified_sender_id
      )
  ) then
    raise exception 'Conversation is unavailable';
  end if;

  select m.id
  into existing_message_id
  from public.messages m
  where m.conversation_id = p_conversation_id
    and m.sender_id = verified_sender_id
    and m.client_attempt_id = p_client_attempt_id
  order by
    m.created_at asc,
    m.id asc
  limit 1;

  if existing_message_id is not null then
    return query
    select
      m.id,
      m.conversation_id,
      m.sender_id,
      case
        when m.deleted_at is null then m.body
        else ''
      end as body,
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
    safe_storage_path := btrim(
      coalesce(
        attachment_record.storage_path,
        ''
      )
    );

    safe_content_type := btrim(
      coalesce(
        attachment_record.content_type,
        ''
      )
    );

    safe_extension := lower(
      split_part(
        safe_storage_path,
        '.',
        array_length(
          string_to_array(
            safe_storage_path,
            '.'
          ),
          1
        )
      )
    );

    if safe_storage_path !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    then
      raise exception 'Message attachment path is invalid';
    end if;

    if split_part(
      safe_storage_path,
      '/',
      1
    ) <> p_conversation_id::text then
      raise exception 'Message attachment path is invalid';
    end if;

    if split_part(
      safe_storage_path,
      '/',
      2
    ) <> p_client_attempt_id::text then
      raise exception 'Message attachment path is invalid';
    end if;

    if safe_content_type not in (
      'image/jpeg',
      'image/png',
      'image/webp'
    ) then
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
    order by
      m.created_at asc,
      m.id asc
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
    case
      when m.deleted_at is null then m.body
      else ''
    end as body,
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

  if p_message_id is null then
    raise exception 'Message is unavailable';
  end if;

  select coalesce(
    array_agg(
      ma.storage_path
      order by
        ma.position,
        ma.created_at
    ),
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


drop policy if exists "message_attachments_storage_select_participant"
on storage.objects;

create policy "message_attachments_storage_select_participant"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-attachments'
  and (select auth.uid()) is not null

  and name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'

  and array_length(
    storage.foldername(name),
    1
  ) = 2

  and exists (
    select 1
    from public.conversations c
    where c.id::text = (
      storage.foldername(name)
    )[1]
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
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

  and name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'

  and array_length(
    storage.foldername(name),
    1
  ) = 2

  and lower(
    storage.extension(name)
  ) in (
    'jpg',
    'jpeg',
    'png',
    'webp'
  )

  and exists (
    select 1
    from public.conversations c
    where c.id::text = (
      storage.foldername(name)
    )[1]
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
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

  and name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'

  and array_length(
    storage.foldername(name),
    1
  ) = 2

  and exists (
    select 1
    from public.conversations c
    where c.id::text = (
      storage.foldername(name)
    )[1]
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);


do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_attachments'
  ) then
    alter publication supabase_realtime
    add table public.message_attachments;
  end if;
end;
$$;


revoke execute
on function public.prepare_message_insert()
from public;

revoke execute
on function public.prepare_message_insert()
from anon;


revoke execute
on function public.prepare_message_update()
from public;

revoke execute
on function public.prepare_message_update()
from anon;


revoke execute
on function public.prevent_message_attachment_update()
from public;

revoke execute
on function public.prevent_message_attachment_update()
from anon;


revoke execute
on function public.prepare_message_attachment_insert()
from public;

revoke execute
on function public.prepare_message_attachment_insert()
from anon;


revoke execute
on function public.list_conversation_summaries()
from public;

revoke execute
on function public.list_conversation_summaries()
from anon;

grant execute
on function public.list_conversation_summaries()
to authenticated;


revoke execute
on function public.get_message_attachments(uuid)
from public;

revoke execute
on function public.get_message_attachments(uuid)
from anon;

grant execute
on function public.get_message_attachments(uuid)
to authenticated;


revoke execute
on function public.send_conversation_message_with_attachments(
  uuid,
  text,
  uuid,
  jsonb
)
from public;

revoke execute
on function public.send_conversation_message_with_attachments(
  uuid,
  text,
  uuid,
  jsonb
)
from anon;

grant execute
on function public.send_conversation_message_with_attachments(
  uuid,
  text,
  uuid,
  jsonb
)
to authenticated;


revoke execute
on function public.edit_conversation_message(
  uuid,
  text
)
from public;

revoke execute
on function public.edit_conversation_message(
  uuid,
  text
)
from anon;

grant execute
on function public.edit_conversation_message(
  uuid,
  text
)
to authenticated;


revoke execute
on function public.delete_conversation_message_with_attachments(uuid)
from public;

revoke execute
on function public.delete_conversation_message_with_attachments(uuid)
from anon;

grant execute
on function public.delete_conversation_message_with_attachments(uuid)
to authenticated;


notify pgrst, 'reload schema';
