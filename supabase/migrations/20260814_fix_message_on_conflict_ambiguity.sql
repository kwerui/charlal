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
    from public.conversations as c
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
    insert into public.messages as m (
      conversation_id,
      body
    )
    values (
      p_conversation_id,
      safe_body
    )
    returning
      m.id,
      m.conversation_id,
      m.sender_id,
      m.body,
      m.created_at,
      m.client_attempt_id;

    return;
  end if;

  return query
  with inserted_message as (
    insert into public.messages as m (
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
      m.id,
      m.conversation_id,
      m.sender_id,
      m.body,
      m.created_at,
      m.client_attempt_id
  ),
  resolved_message as (
    select
      im.id,
      im.conversation_id,
      im.sender_id,
      im.body,
      im.created_at,
      im.client_attempt_id
    from inserted_message as im
    union all
    select
      em.id,
      em.conversation_id,
      em.sender_id,
      em.body,
      em.created_at,
      em.client_attempt_id
    from public.messages as em
    where em.conversation_id = p_conversation_id
      and em.sender_id = verified_sender_id
      and em.client_attempt_id = p_client_attempt_id
      and not exists (
        select 1
        from inserted_message as im
      )
  )
  select
    rm.id,
    rm.conversation_id,
    rm.sender_id,
    rm.body,
    rm.created_at,
    rm.client_attempt_id
  from resolved_message as rm
  order by rm.created_at asc, rm.id asc
  limit 1;
end;
$$;

revoke execute on function public.send_conversation_message(uuid, text, uuid) from public;
revoke execute on function public.send_conversation_message(uuid, text, uuid) from anon;
grant execute on function public.send_conversation_message(uuid, text, uuid) to authenticated;

notify pgrst, 'reload schema';
