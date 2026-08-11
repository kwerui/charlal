insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'listing-images',
  'listing-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.listing_images (
  id uuid primary key default gen_random_uuid(),
  listing_id text not null references public.listings(id) on delete cascade,
  storage_path text not null unique,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint listing_images_storage_path_not_blank check (length(btrim(storage_path)) > 0),
  constraint listing_images_position_range check (position >= 0 and position < 8),
  constraint listing_images_path_shape check (
    storage_path ~ '^[^/]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
  )
);

create index if not exists listing_images_listing_id_position_idx
on public.listing_images (listing_id, position, created_at);

create index if not exists listing_images_listing_id_idx
on public.listing_images (listing_id);

create or replace function public.prepare_listing_image_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  image_count integer;
begin
  new.storage_path := btrim(new.storage_path);
  new.created_at := coalesce(new.created_at, now());

  select count(*)
  into image_count
  from public.listing_images li
  where li.listing_id = new.listing_id;

  if image_count >= 8 then
    raise exception 'A listing can have at most 8 images';
  end if;

  return new;
end;
$$;

drop trigger if exists listing_images_prepare_insert on public.listing_images;
create trigger listing_images_prepare_insert
before insert on public.listing_images
for each row
execute function public.prepare_listing_image_insert();

create or replace function public.prevent_listing_image_identity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Listing image id cannot be changed';
  end if;

  if new.listing_id <> old.listing_id then
    raise exception 'Listing image listing cannot be changed';
  end if;

  if new.storage_path <> old.storage_path then
    raise exception 'Listing image storage path cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Listing image creation time cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists listing_images_prevent_identity_change on public.listing_images;
create trigger listing_images_prevent_identity_change
before update on public.listing_images
for each row
execute function public.prevent_listing_image_identity_change();

alter table public.listing_images enable row level security;

revoke all on public.listing_images from anon;
revoke all on public.listing_images from authenticated;
revoke all on public.listing_images from public;

grant select on public.listing_images to anon, authenticated;
grant insert (listing_id, storage_path, position) on public.listing_images to authenticated;
grant update (position) on public.listing_images to authenticated;
grant delete on public.listing_images to authenticated;

drop policy if exists "listing_images_select_public" on public.listing_images;
create policy "listing_images_select_public"
on public.listing_images
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
  )
);

drop policy if exists "listing_images_insert_owner" on public.listing_images;
create policy "listing_images_insert_owner"
on public.listing_images
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "listing_images_update_owner" on public.listing_images;
create policy "listing_images_update_owner"
on public.listing_images
for update
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_id = (select auth.uid())
  )
)
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "listing_images_delete_owner" on public.listing_images;
create policy "listing_images_delete_owner"
on public.listing_images
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.listings l
    where l.id = listing_images.listing_id
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "listing_images_storage_select_public" on storage.objects;
create policy "listing_images_storage_select_public"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'listing-images');

drop policy if exists "listing_images_storage_insert_owner" on storage.objects;
create policy "listing_images_storage_insert_owner"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and array_length(storage.foldername(name), 1) = 1
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and exists (
    select 1
    from public.listings l
    where l.id = (storage.foldername(name))[1]
      and l.owner_id = (select auth.uid())
  )
);

drop policy if exists "listing_images_storage_delete_owner" on storage.objects;
create policy "listing_images_storage_delete_owner"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'listing-images'
  and (select auth.uid()) is not null
  and array_length(storage.foldername(name), 1) = 1
  and exists (
    select 1
    from public.listings l
    where l.id = (storage.foldername(name))[1]
      and l.owner_id = (select auth.uid())
  )
);

notify pgrst, 'reload schema';
