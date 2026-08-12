alter table public.profiles
add column if not exists avatar_focus_x smallint not null default 50;

alter table public.profiles
add column if not exists avatar_focus_y smallint not null default 50;

alter table public.profiles
add column if not exists avatar_zoom smallint not null default 100;

alter table public.profiles
drop constraint if exists profiles_avatar_focus_x_range;

alter table public.profiles
add constraint profiles_avatar_focus_x_range
check (avatar_focus_x between 0 and 100);

alter table public.profiles
drop constraint if exists profiles_avatar_focus_y_range;

alter table public.profiles
add constraint profiles_avatar_focus_y_range
check (avatar_focus_y between 0 and 100);

alter table public.profiles
drop constraint if exists profiles_avatar_zoom_range;

alter table public.profiles
add constraint profiles_avatar_zoom_range
check (avatar_zoom between 100 and 300);

create or replace function public.normalize_profile_public_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.public_slug := btrim(new.public_slug);
  new.bio := nullif(btrim(new.bio), '');
  new.location := nullif(btrim(new.location), '');
  new.avatar_path := nullif(btrim(new.avatar_path), '');
  new.avatar_focus_x := least(100, greatest(0, coalesce(new.avatar_focus_x, 50)));
  new.avatar_focus_y := least(100, greatest(0, coalesce(new.avatar_focus_y, 50)));
  new.avatar_zoom := least(300, greatest(100, coalesce(new.avatar_zoom, 100)));

  return new;
end;
$$;

create or replace function public.set_current_profile_avatar(
  p_avatar_path text,
  p_avatar_focus_x integer,
  p_avatar_focus_y integer,
  p_avatar_zoom integer
)
returns table (
  public_slug text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint,
  previous_avatar_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  profile_record record;
  safe_avatar_path text;
  safe_focus_x smallint;
  safe_focus_y smallint;
  safe_zoom smallint;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to update a profile avatar';
  end if;

  safe_avatar_path := nullif(btrim(coalesce(p_avatar_path, '')), '');
  safe_focus_x := least(100, greatest(0, coalesce(p_avatar_focus_x, 50)))::smallint;
  safe_focus_y := least(100, greatest(0, coalesce(p_avatar_focus_y, 50)))::smallint;
  safe_zoom := least(300, greatest(100, coalesce(p_avatar_zoom, 100)))::smallint;

  select
    p.public_slug,
    p.avatar_path
  into profile_record
  from public.profiles p
  where p.id = viewer_id;

  if not found then
    raise exception 'Profile is unavailable';
  end if;

  if safe_avatar_path is not null then
    if safe_avatar_path !~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
      raise exception 'Avatar path is invalid';
    end if;

    if split_part(safe_avatar_path, '/', 1) <> profile_record.public_slug then
      raise exception 'Avatar path does not belong to this profile';
    end if;
  end if;

  update public.profiles p
  set
    avatar_path = safe_avatar_path,
    avatar_focus_x = safe_focus_x,
    avatar_focus_y = safe_focus_y,
    avatar_zoom = safe_zoom
  where p.id = viewer_id;

  return query
  select
    profile_record.public_slug::text,
    safe_avatar_path::text,
    safe_focus_x,
    safe_focus_y,
    safe_zoom,
    profile_record.avatar_path::text;
end;
$$;

revoke all on function public.set_current_profile_avatar(text, integer, integer, integer) from public;
revoke all on function public.set_current_profile_avatar(text, integer, integer, integer) from anon;
grant execute on function public.set_current_profile_avatar(text, integer, integer, integer) to authenticated;

drop function if exists public.get_public_seller_profile(text);
create function public.get_public_seller_profile(p_public_slug text)
returns table (
  public_slug text,
  display_name text,
  bio text,
  location text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint,
  member_since timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    p.display_name,
    p.bio,
    p.location,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom,
    p.created_at as member_since
  from public.profiles p
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
  limit 1
$$;

revoke all on function public.get_public_seller_profile(text) from public;
revoke all on function public.get_public_seller_profile(text) from anon;
grant execute on function public.get_public_seller_profile(text) to anon, authenticated;

drop function if exists public.get_listing_public_seller_profile(text);
create function public.get_listing_public_seller_profile(p_listing_id text)
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
    and (
      l.status <> 'archived'
      or (
        (select auth.uid()) is not null
        and l.owner_id = (select auth.uid())
      )
    )
  limit 1
$$;

revoke all on function public.get_listing_public_seller_profile(text) from public;
revoke all on function public.get_listing_public_seller_profile(text) from anon;
grant execute on function public.get_listing_public_seller_profile(text) to anon, authenticated;

notify pgrst, 'reload schema';
