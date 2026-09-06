create or replace function public.admin_get_user_profile(
  p_user_id uuid
)
returns table (
  user_id uuid,
  display_name text,
  public_slug text,
  email text,
  created_at timestamptz
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
    u.id,
    coalesce(p.display_name, ''),
    coalesce(p.public_slug, ''),
    u.email::text,
    u.created_at
  from auth.users u
  left join public.profiles p
    on p.id = u.id
  where u.id = p_user_id;
end;
$$;

create or replace function public.list_admin_user_moderation_audit_events(
  p_user_id uuid
)
returns table (
  event_id uuid,
  actor_id uuid,
  actor_display_name text,
  target_user_id uuid,
  action text,
  previous_state text,
  new_state text,
  created_at timestamptz
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
    event.id,
    event.actor_id,
    nullif(btrim(actor.display_name), ''),
    event.target_user_id,
    event.action,
    event.previous_state,
    event.new_state,
    event.created_at
  from private.user_moderation_audit_events event
  left join public.profiles actor
    on actor.id = event.actor_id
  where event.target_user_id = p_user_id
  order by event.created_at desc, event.id desc
  limit 50;
end;
$$;

alter function public.admin_get_user_profile(uuid)
owner to postgres;

alter function public.list_admin_user_moderation_audit_events(uuid)
owner to postgres;

revoke all on function public.admin_get_user_profile(uuid) from public;
revoke all on function public.admin_get_user_profile(uuid) from anon;
grant execute on function public.admin_get_user_profile(uuid) to authenticated;

revoke all on function public.list_admin_user_moderation_audit_events(uuid) from public;
revoke all on function public.list_admin_user_moderation_audit_events(uuid) from anon;
grant execute on function public.list_admin_user_moderation_audit_events(uuid) to authenticated;
