begin;

-- listing_images INSERT:
-- replace direct access to public.listings.owner_id with the existing
-- SECURITY DEFINER ownership helper.

drop policy if exists "listing_images_insert_owner"
on public.listing_images;

create policy "listing_images_insert_owner"
on public.listing_images
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and public.current_user_owns_listing(listing_id)
);


-- listing_images UPDATE:
-- both the existing row and the proposed updated row must belong
-- to a listing owned by the current authenticated user.

drop policy if exists "listing_images_update_owner"
on public.listing_images;

create policy "listing_images_update_owner"
on public.listing_images
for update
to authenticated
using (
  (select auth.uid()) is not null
  and public.current_user_owns_listing(listing_id)
)
with check (
  (select auth.uid()) is not null
  and public.current_user_owns_listing(listing_id)
);


-- listing_images DELETE:
-- only images belonging to one of the current user's listings
-- may be deleted.

drop policy if exists "listing_images_delete_owner"
on public.listing_images;

create policy "listing_images_delete_owner"
on public.listing_images
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and public.current_user_owns_listing(listing_id)
);


-- listing-images Storage DELETE:
-- preserve the existing bucket/path restrictions while replacing
-- the direct public.listings.owner_id lookup.

drop policy if exists "listing_images_storage_delete_owner"
on storage.objects;

create policy "listing_images_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and array_length(storage.foldername(name), 1) = 1
  and public.current_user_owns_listing(
    (storage.foldername(name))[1]
  )
);

notify pgrst, 'reload schema';

commit;