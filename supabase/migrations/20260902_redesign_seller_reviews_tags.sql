begin;

create or replace function public.seller_review_tags_valid(
  p_tags text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_tags is not null
    and cardinality(p_tags) <= 3
    and not exists (
      select 1
      from unnest(p_tags) as tag(value)
      where tag.value not in (
        'satisfied',
        'friendly_seller',
        'good_communication',
        'quick_handover',
        'fair_price',
        'not_satisfied',
        'poor_communication',
        'handover_issue'
      )
    )
    and (
      select count(*) = count(distinct tag.value)
      from unnest(p_tags) as tag(value)
    )
$$;

alter table public.seller_reviews
add column if not exists tags text[] not null default array[]::text[];

update public.seller_reviews
set tags = array[]::text[]
where tags is null;

alter table public.seller_reviews
drop constraint if exists seller_reviews_tags_valid;

alter table public.seller_reviews
add constraint seller_reviews_tags_valid
check (public.seller_review_tags_valid(tags));

create or replace function public.prepare_seller_review_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_buyer_id uuid;
  transaction_record record;
begin
  verified_buyer_id := auth.uid();

  if verified_buyer_id is null then
    raise exception 'Authenticated user is required to leave a review';
  end if;

  select clt.seller_id, clt.buyer_id
  into transaction_record
  from public.completed_listing_transactions clt
  where clt.id = new.transaction_id;

  if not found then
    raise exception 'Purchase is unavailable';
  end if;

  if transaction_record.buyer_id <> verified_buyer_id then
    raise exception 'Only the buyer can review this purchase';
  end if;

  if transaction_record.seller_id = verified_buyer_id then
    raise exception 'You cannot review yourself';
  end if;

  new.seller_id := transaction_record.seller_id;
  new.buyer_id := transaction_record.buyer_id;
  new.tags := coalesce(new.tags, array[]::text[]);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  return new;
end;
$$;

create or replace function public.prepare_seller_review_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id then
    raise exception 'Review id cannot be changed';
  end if;

  if new.transaction_id <> old.transaction_id then
    raise exception 'Review purchase cannot be changed';
  end if;

  if new.seller_id <> old.seller_id
     or new.buyer_id <> old.buyer_id then
    raise exception 'Review participants cannot be changed';
  end if;

  if new.created_at <> old.created_at then
    raise exception 'Review creation time cannot be changed';
  end if;

  new.tags := coalesce(new.tags, array[]::text[]);

  if new.rating is distinct from old.rating
     or new.tags is distinct from old.tags then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

revoke all on public.seller_reviews from authenticated;
grant select on public.seller_reviews to authenticated;
grant insert (transaction_id, rating, tags) on public.seller_reviews to authenticated;
grant update (rating, tags) on public.seller_reviews to authenticated;

drop function if exists public.list_my_reviewable_transactions();

create or replace function public.list_my_reviewable_transactions()
returns table (
  transaction_id uuid,
  seller_id uuid,
  seller_display_name text,
  seller_public_slug text,
  seller_avatar_path text,
  seller_avatar_focus_x smallint,
  seller_avatar_focus_y smallint,
  seller_avatar_zoom smallint,
  listing_id text,
  listing_title_snapshot text,
  completed_at timestamptz,
  review_id uuid,
  rating smallint,
  review_tags text[],
  review_created_at timestamptz,
  review_updated_at timestamptz
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
    clt.id,
    clt.seller_id,
    coalesce(nullif(btrim(p.display_name), ''), 'Marketplace user')::text,
    p.public_slug,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom,
    clt.listing_id,
    clt.listing_title_snapshot,
    clt.completed_at,
    sr.id,
    sr.rating,
    coalesce(sr.tags, array[]::text[]) as review_tags,
    sr.created_at,
    sr.updated_at
  from public.completed_listing_transactions clt
  join public.profiles p
    on p.id = clt.seller_id
  left join public.seller_reviews sr
    on sr.transaction_id = clt.id
  where clt.buyer_id = viewer_id
  order by clt.completed_at desc, clt.id desc;
end;
$$;

drop function if exists public.list_public_seller_reviews(text, integer);

create or replace function public.list_public_seller_reviews(
  p_public_slug text,
  p_limit integer default 50
)
returns table (
  review_id uuid,
  rating smallint,
  review_tags text[],
  review_created_at timestamptz,
  review_updated_at timestamptz,
  listing_title_snapshot text,
  completed_at timestamptz,
  buyer_display_name text,
  buyer_public_slug text,
  buyer_avatar_path text,
  buyer_avatar_focus_x smallint,
  buyer_avatar_focus_y smallint,
  buyer_avatar_zoom smallint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_limit integer;
begin
  safe_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  return query
  select
    sr.id,
    sr.rating,
    coalesce(sr.tags, array[]::text[]) as review_tags,
    sr.created_at,
    sr.updated_at,
    clt.listing_title_snapshot,
    clt.completed_at,
    coalesce(nullif(btrim(bp.display_name), ''), 'Marketplace user')::text,
    bp.public_slug,
    bp.avatar_path,
    bp.avatar_focus_x,
    bp.avatar_focus_y,
    bp.avatar_zoom
  from public.profiles sp
  join public.seller_reviews sr
    on sr.seller_id = sp.id
  join public.completed_listing_transactions clt
    on clt.id = sr.transaction_id
  join public.profiles bp
    on bp.id = sr.buyer_id
  where sp.public_slug = btrim(p_public_slug)
    and sp.public_slug ~ '^seller-[a-f0-9]{32}$'
  order by sr.created_at desc, sr.id desc
  limit safe_limit;
end;
$$;

drop policy if exists "review_media_storage_select_public" on storage.objects;
drop policy if exists "review_media_storage_insert_buyer" on storage.objects;
drop policy if exists "review_media_storage_delete_buyer" on storage.objects;

update storage.buckets
set public = false
where id = 'review-media';

drop policy if exists "seller_review_responses_select_public"
on public.seller_review_responses;
drop policy if exists "seller_review_responses_select_seller"
on public.seller_review_responses;
drop policy if exists "seller_review_responses_insert_seller"
on public.seller_review_responses;
drop policy if exists "seller_review_responses_update_seller"
on public.seller_review_responses;
drop policy if exists "seller_review_responses_delete_seller"
on public.seller_review_responses;

drop policy if exists "seller_review_photos_select_public"
on public.seller_review_photos;
drop policy if exists "seller_review_photos_select_buyer"
on public.seller_review_photos;
drop policy if exists "seller_review_photos_insert_buyer"
on public.seller_review_photos;
drop policy if exists "seller_review_photos_delete_buyer"
on public.seller_review_photos;

drop trigger if exists seller_review_responses_prepare_insert
on public.seller_review_responses;
drop trigger if exists seller_review_responses_prepare_update
on public.seller_review_responses;
drop trigger if exists seller_review_photos_prepare_insert
on public.seller_review_photos;
drop trigger if exists seller_review_photos_prevent_update
on public.seller_review_photos;

drop table if exists public.seller_review_responses;
drop table if exists public.seller_review_photos;

drop function if exists public.prepare_seller_review_response_insert();
drop function if exists public.prepare_seller_review_response_update();
drop function if exists public.prepare_seller_review_photo_insert();
drop function if exists public.prevent_seller_review_photo_update();
drop function if exists public.current_user_owns_seller_review_path(text);
drop function if exists public.list_own_seller_review_photo_paths(uuid);

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

alter table public.seller_reviews
drop constraint if exists seller_reviews_body_length;

alter table public.seller_reviews
drop column if exists body;

revoke all on function public.list_my_reviewable_transactions() from public;
revoke all on function public.list_my_reviewable_transactions() from anon;
grant execute on function public.list_my_reviewable_transactions() to authenticated;

revoke all on function public.list_public_seller_reviews(text, integer)
from public;
grant execute on function public.list_public_seller_reviews(text, integer)
to anon, authenticated;

revoke all on function public.seller_review_tags_valid(text[]) from public;

grant execute on function public.seller_review_tags_valid(text[])
to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
