begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_user_storage_uploads_below_limit(
  p_bucket_id text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
  upload_limit integer;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return false;
  end if;

  upload_limit := case p_bucket_id
    when 'listing-images' then 100
    when 'profile-avatars' then 20
    when 'review-media' then 30
    else null
  end;

  if upload_limit is null then
    return false;
  end if;

  return (
    select count(*) < upload_limit
    from storage.objects so
    where so.bucket_id = p_bucket_id
      and so.owner_id = viewer_id::text
      and so.created_at > now() - interval '1 day'
  );
end;
$$;

alter function private.current_user_storage_uploads_below_limit(text)
owner to postgres;

revoke all
on function private.current_user_storage_uploads_below_limit(text)
from public;

revoke all
on function private.current_user_storage_uploads_below_limit(text)
from anon;

grant execute
on function private.current_user_storage_uploads_below_limit(text)
to authenticated;

drop policy if exists "listing_images_storage_insert_owner" on storage.objects;
create policy "listing_images_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and name ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and private.current_user_storage_uploads_below_limit('listing-images')
  and exists (
    select 1
    from public.listings l
    where l.id = (storage.foldername(name))[1]
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "profile_avatars_storage_insert_owner" on storage.objects;
create policy "profile_avatars_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and name ~ '^seller-[a-f0-9]{32}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
  and private.current_user_storage_uploads_below_limit('profile-avatars')
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.public_slug = (storage.foldername(name))[1]
  )
);

drop policy if exists "review_media_storage_insert_buyer" on storage.objects;
create policy "review_media_storage_insert_buyer"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'review-media'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  and private.current_user_storage_uploads_below_limit('review-media')
  and public.current_user_owns_seller_review_path(name)
);

notify pgrst, 'reload schema';

commit;
