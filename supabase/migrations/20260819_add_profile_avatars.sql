insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'profile-avatars',
  'profile-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.profiles
add column if not exists avatar_path text;

alter table public.profiles
drop constraint if exists profiles_avatar_path_shape;

alter table public.profiles
add constraint profiles_avatar_path_shape
check (
  avatar_path is null
  or avatar_path ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);

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

  return new;
end;
$$;

create or replace function public.set_current_profile_avatar_path(
  p_avatar_path text
)
returns table (
  public_slug text,
  avatar_path text,
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
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to update a profile avatar';
  end if;

  safe_avatar_path := nullif(btrim(coalesce(p_avatar_path, '')), '');

  select p.public_slug, p.avatar_path
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
  set avatar_path = safe_avatar_path
  where p.id = viewer_id;

  return query
  select
    profile_record.public_slug::text,
    safe_avatar_path::text,
    profile_record.avatar_path::text;
end;
$$;

revoke all on function public.set_current_profile_avatar_path(text) from public;
revoke all on function public.set_current_profile_avatar_path(text) from anon;
grant execute on function public.set_current_profile_avatar_path(text) to authenticated;

drop function if exists public.get_public_seller_profile(text);
create function public.get_public_seller_profile(p_public_slug text)
returns table (
  public_slug text,
  display_name text,
  bio text,
  location text,
  avatar_path text,
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
  avatar_path text
)
language sql
security definer
set search_path = ''
as $$
  select
    p.public_slug,
    p.display_name,
    p.avatar_path
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

drop policy if exists "profile_avatars_storage_select_public" on storage.objects;
create policy "profile_avatars_storage_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-avatars');

drop policy if exists "profile_avatars_storage_insert_owner" on storage.objects;
create policy "profile_avatars_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

drop policy if exists "profile_avatars_storage_delete_owner" on storage.objects;
create policy "profile_avatars_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

notify pgrst, 'reload schema';
