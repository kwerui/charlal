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
    p.display_name as other_participant_display_name,
    p.public_slug as other_participant_public_slug,
    p.avatar_path as other_participant_avatar_path,
    p.avatar_focus_x as other_participant_avatar_focus_x,
    p.avatar_focus_y as other_participant_avatar_focus_y,
    p.avatar_zoom as other_participant_avatar_zoom,
    case
      when latest_message.deleted_at is not null then ''
      else coalesce(left(replace(latest_message.body, E'\n', ' '), 160), '')
    end as last_message_preview,
    c.last_message_at,
    coalesce(unread_messages.unread_count, 0)::bigint as unread_count,
    (latest_message.deleted_at is not null) as last_message_deleted
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

create or replace function public.get_conversation_public_counterpart(
  p_conversation_id uuid
)
returns table (
  display_name text,
  public_slug text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint
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

  return query
  select
    p.display_name,
    p.public_slug,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom
  from public.conversations c
  join public.profiles p
    on p.id = case
      when c.buyer_id = viewer_id then c.seller_id
      else c.buyer_id
    end
  where c.id = p_conversation_id
    and (c.buyer_id = viewer_id or c.seller_id = viewer_id)
  limit 1;
end;
$$;

revoke execute on function public.list_conversation_summaries() from public;
revoke execute on function public.list_conversation_summaries() from anon;
grant execute on function public.list_conversation_summaries() to authenticated;

revoke execute on function public.get_conversation_public_counterpart(uuid) from public;
revoke execute on function public.get_conversation_public_counterpart(uuid) from anon;
grant execute on function public.get_conversation_public_counterpart(uuid) to authenticated;

notify pgrst, 'reload schema';
