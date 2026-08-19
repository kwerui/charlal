begin;

drop policy if exists "listing_images_storage_insert_owner"
on storage.objects;

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
  and public.current_user_owns_listing(
    (storage.foldername(name))[1]
  )
);

notify pgrst, 'reload schema';

commit;