alter table public.messages
add column if not exists client_attempt_id uuid;

create unique index if not exists messages_conversation_sender_attempt_id_idx
on public.messages (conversation_id, sender_id, client_attempt_id)
where client_attempt_id is not null;

grant insert (conversation_id, body, client_attempt_id) on public.messages to authenticated;

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
  client_attempt_id uuid
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
    insert into public.messages (
      conversation_id,
      body
    )
    values (
      p_conversation_id,
      safe_body
    )
    returning
      public.messages.id,
      public.messages.conversation_id,
      public.messages.sender_id,
      public.messages.body,
      public.messages.created_at,
      public.messages.client_attempt_id;

    return;
  end if;

  return query
  with inserted_message as (
    insert into public.messages (
      conversation_id,
      body,
      client_attempt_id
    )
    values (
      p_conversation_id,
      safe_body,
      p_client_attempt_id
    )
    on conflict (conversation_id, sender_id, client_attempt_id)
    where client_attempt_id is not null
    do nothing
    returning
      public.messages.id,
      public.messages.conversation_id,
      public.messages.sender_id,
      public.messages.body,
      public.messages.created_at,
      public.messages.client_attempt_id
  )
  select
    inserted_message.id,
    inserted_message.conversation_id,
    inserted_message.sender_id,
    inserted_message.body,
    inserted_message.created_at,
    inserted_message.client_attempt_id
  from inserted_message
  union all
  select
    existing_message.id,
    existing_message.conversation_id,
    existing_message.sender_id,
    existing_message.body,
    existing_message.created_at,
    existing_message.client_attempt_id
  from public.messages existing_message
  where existing_message.conversation_id = p_conversation_id
    and existing_message.sender_id = verified_sender_id
    and existing_message.client_attempt_id = p_client_attempt_id
    and not exists (
      select 1
      from inserted_message
    )
  order by created_at asc, id asc
  limit 1;
end;
$$;

revoke execute on function public.send_conversation_message(uuid, text, uuid) from public;
revoke execute on function public.send_conversation_message(uuid, text, uuid) from anon;
grant execute on function public.send_conversation_message(uuid, text, uuid) to authenticated;
