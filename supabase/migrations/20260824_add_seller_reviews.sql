insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'review-media',
  'review-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


create table if not exists public.completed_listing_transactions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  listing_id text references public.listings(id) on delete set null,
  listing_title_snapshot text not null,
  listing_category_snapshot text,
  listing_subcategory_snapshot text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint completed_listing_transactions_seller_not_buyer
    check (seller_id <> buyer_id),
  constraint completed_listing_transactions_title_not_blank
    check (length(btrim(listing_title_snapshot)) > 0),
  constraint completed_listing_transactions_title_length
    check (char_length(listing_title_snapshot) <= 240)
);

create unique index if not exists completed_listing_transactions_one_per_listing_idx
on public.completed_listing_transactions (listing_id)
where listing_id is not null;

create index if not exists completed_listing_transactions_buyer_completed_idx
on public.completed_listing_transactions (buyer_id, completed_at desc);

create index if not exists completed_listing_transactions_seller_completed_idx
on public.completed_listing_transactions (seller_id, completed_at desc);


create table if not exists public.seller_reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique
    references public.completed_listing_transactions(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null,
  body text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint seller_reviews_rating_range check (rating between 1 and 5),
  constraint seller_reviews_body_length check (
    body is null or char_length(body) <= 2000
  ),
  constraint seller_reviews_seller_not_buyer check (seller_id <> buyer_id)
);

create index if not exists seller_reviews_seller_created_idx
on public.seller_reviews (seller_id, created_at desc);

create index if not exists seller_reviews_buyer_created_idx
on public.seller_reviews (buyer_id, created_at desc);


create table if not exists public.seller_review_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique
    references public.seller_reviews(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint seller_review_responses_body_not_blank
    check (length(btrim(body)) > 0),
  constraint seller_review_responses_body_length
    check (char_length(body) <= 1200)
);

create index if not exists seller_review_responses_seller_idx
on public.seller_review_responses (seller_id, created_at desc);


create table if not exists public.seller_review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.seller_reviews(id) on delete cascade,
  storage_path text not null unique,
  position smallint not null,
  content_type text not null,
  created_at timestamptz not null default now(),

  constraint seller_review_photos_storage_path_not_blank
    check (length(btrim(storage_path)) > 0),
  constraint seller_review_photos_position_range
    check (position >= 0 and position < 3),
  constraint seller_review_photos_content_type
    check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint seller_review_photos_path_shape
    check (
      storage_path ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
    ),
  constraint seller_review_photos_position_unique
    unique (review_id, position)
);

create index if not exists seller_review_photos_review_position_idx
on public.seller_review_photos (review_id, position, created_at);


create or replace function public.prepare_completed_listing_transaction_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.listing_title_snapshot := btrim(new.listing_title_snapshot);
  new.listing_category_snapshot := nullif(btrim(new.listing_category_snapshot), '');
  new.listing_subcategory_snapshot := nullif(btrim(new.listing_subcategory_snapshot), '');
  new.completed_at := coalesce(new.completed_at, now());
  new.created_at := coalesce(new.created_at, now());

  return new;
end;
$$;

drop trigger if exists completed_listing_transactions_prepare_insert
on public.completed_listing_transactions;

create trigger completed_listing_transactions_prepare_insert
before insert on public.completed_listing_transactions
for each row
execute function public.prepare_completed_listing_transaction_insert();


create or replace function public.prevent_completed_listing_transaction_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.listing_id is not null
     and new.listing_id is null
     and new.id = old.id
     and new.seller_id = old.seller_id
     and new.buyer_id = old.buyer_id
     and new.listing_title_snapshot = old.listing_title_snapshot
     and new.listing_category_snapshot is not distinct from old.listing_category_snapshot
     and new.listing_subcategory_snapshot is not distinct from old.listing_subcategory_snapshot
     and new.completed_at = old.completed_at
     and new.created_at = old.created_at then
    return new;
  end if;

  raise exception 'Completed transactions cannot be changed';
end;
$$;

drop trigger if exists completed_listing_transactions_prevent_update
on public.completed_listing_transactions;

create trigger completed_listing_transactions_prevent_update
before update on public.completed_listing_transactions
for each row
execute function public.prevent_completed_listing_transaction_change();


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
  new.body := nullif(btrim(coalesce(new.body, '')), '');
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  return new;
end;
$$;

drop trigger if exists seller_reviews_prepare_insert on public.seller_reviews;

create trigger seller_reviews_prepare_insert
before insert on public.seller_reviews
for each row
execute function public.prepare_seller_review_insert();


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

  new.body := nullif(btrim(coalesce(new.body, '')), '');

  if new.rating is distinct from old.rating
     or new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists seller_reviews_prepare_update on public.seller_reviews;

create trigger seller_reviews_prepare_update
before update on public.seller_reviews
for each row
execute function public.prepare_seller_review_update();


create or replace function public.prepare_seller_review_response_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  verified_seller_id uuid;
  review_seller_id uuid;
begin
  verified_seller_id := auth.uid();

  if verified_seller_id is null then
    raise exception 'Authenticated user is required to respond';
  end if;

  select sr.seller_id
  into review_seller_id
  from public.seller_reviews sr
  where sr.id = new.review_id;

  if not found or review_seller_id <> verified_seller_id then
    raise exception 'Only the reviewed seller can respond';
  end if;

  new.seller_id := verified_seller_id;
  new.body := btrim(new.body);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  return new;
end;
$$;

drop trigger if exists seller_review_responses_prepare_insert
on public.seller_review_responses;

create trigger seller_review_responses_prepare_insert
before insert on public.seller_review_responses
for each row
execute function public.prepare_seller_review_response_insert();


create or replace function public.prepare_seller_review_response_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id <> old.id
     or new.review_id <> old.review_id
     or new.seller_id <> old.seller_id
     or new.created_at <> old.created_at then
    raise exception 'Seller response identity cannot be changed';
  end if;

  new.body := btrim(new.body);

  if new.body is distinct from old.body then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;

  return new;
end;
$$;

drop trigger if exists seller_review_responses_prepare_update
on public.seller_review_responses;

create trigger seller_review_responses_prepare_update
before update on public.seller_review_responses
for each row
execute function public.prepare_seller_review_response_update();


create or replace function public.prepare_seller_review_photo_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  photo_count integer;
begin
  new.storage_path := btrim(new.storage_path);
  new.content_type := btrim(new.content_type);
  new.created_at := coalesce(new.created_at, now());

  if split_part(new.storage_path, '/', 1) <> new.review_id::text then
    raise exception 'Review photo path does not match review';
  end if;

  select count(*)
  into photo_count
  from public.seller_review_photos srp
  where srp.review_id = new.review_id;

  if photo_count >= 3 then
    raise exception 'A review can have at most 3 photos';
  end if;

  return new;
end;
$$;

drop trigger if exists seller_review_photos_prepare_insert
on public.seller_review_photos;

create trigger seller_review_photos_prepare_insert
before insert on public.seller_review_photos
for each row
execute function public.prepare_seller_review_photo_insert();


create or replace function public.prevent_seller_review_photo_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Review photos cannot be changed';
end;
$$;

drop trigger if exists seller_review_photos_prevent_update
on public.seller_review_photos;

create trigger seller_review_photos_prevent_update
before update on public.seller_review_photos
for each row
execute function public.prevent_seller_review_photo_update();


alter table public.completed_listing_transactions enable row level security;
alter table public.seller_reviews enable row level security;
alter table public.seller_review_responses enable row level security;
alter table public.seller_review_photos enable row level security;

revoke all on public.completed_listing_transactions from anon;
revoke all on public.completed_listing_transactions from authenticated;
revoke all on public.completed_listing_transactions from public;
revoke all on public.seller_reviews from anon;
revoke all on public.seller_reviews from authenticated;
revoke all on public.seller_reviews from public;
revoke all on public.seller_review_responses from anon;
revoke all on public.seller_review_responses from authenticated;
revoke all on public.seller_review_responses from public;
revoke all on public.seller_review_photos from anon;
revoke all on public.seller_review_photos from authenticated;
revoke all on public.seller_review_photos from public;

grant select on public.completed_listing_transactions to authenticated;
grant select on public.seller_reviews to authenticated;
grant insert (transaction_id, rating, body) on public.seller_reviews to authenticated;
grant update (rating, body) on public.seller_reviews to authenticated;
grant select on public.seller_review_responses to authenticated;
grant insert (review_id, body) on public.seller_review_responses to authenticated;
grant update (body) on public.seller_review_responses to authenticated;
grant delete on public.seller_review_responses to authenticated;
grant select on public.seller_review_photos to authenticated;
grant insert (review_id, storage_path, position, content_type)
  on public.seller_review_photos to authenticated;
grant delete on public.seller_review_photos to authenticated;


drop policy if exists "completed_listing_transactions_select_participant"
on public.completed_listing_transactions;

create policy "completed_listing_transactions_select_participant"
on public.completed_listing_transactions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    seller_id = (select auth.uid())
    or buyer_id = (select auth.uid())
  )
);

create or replace function public.current_user_owns_seller_review(
  p_review_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.seller_reviews sr
      where sr.id = p_review_id
        and sr.buyer_id = auth.uid()
    )
$$;


create or replace function public.current_user_owns_seller_review_path(
  p_storage_path text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_storage_path text;
  review_id_text text;
begin
  if auth.uid() is null then
    return false;
  end if;

  safe_storage_path := btrim(coalesce(p_storage_path, ''));

  if safe_storage_path !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then
    return false;
  end if;

  review_id_text := split_part(safe_storage_path, '/', 1);

  return public.current_user_owns_seller_review(review_id_text::uuid);
end;
$$;


drop policy if exists "seller_reviews_select_public" on public.seller_reviews;
drop policy if exists "seller_reviews_select_participant" on public.seller_reviews;
create policy "seller_reviews_select_participant"
on public.seller_reviews
for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
  )
);

drop policy if exists "seller_reviews_insert_buyer" on public.seller_reviews;
create policy "seller_reviews_insert_buyer"
on public.seller_reviews
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.completed_listing_transactions clt
    where clt.id = seller_reviews.transaction_id
      and clt.buyer_id = (select auth.uid())
      and clt.seller_id <> (select auth.uid())
  )
);

drop policy if exists "seller_reviews_update_buyer" on public.seller_reviews;
create policy "seller_reviews_update_buyer"
on public.seller_reviews
for update
to authenticated
using (buyer_id = (select auth.uid()))
with check (buyer_id = (select auth.uid()));

drop policy if exists "seller_review_responses_select_public"
on public.seller_review_responses;
drop policy if exists "seller_review_responses_select_seller"
on public.seller_review_responses;

create policy "seller_review_responses_select_seller"
on public.seller_review_responses
for select
to authenticated
using (seller_id = (select auth.uid()));

drop policy if exists "seller_review_responses_insert_seller"
on public.seller_review_responses;

create policy "seller_review_responses_insert_seller"
on public.seller_review_responses
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.seller_reviews sr
    where sr.id = seller_review_responses.review_id
      and sr.seller_id = (select auth.uid())
  )
);

drop policy if exists "seller_review_responses_update_seller"
on public.seller_review_responses;

create policy "seller_review_responses_update_seller"
on public.seller_review_responses
for update
to authenticated
using (seller_id = (select auth.uid()))
with check (seller_id = (select auth.uid()));

drop policy if exists "seller_review_responses_delete_seller"
on public.seller_review_responses;

create policy "seller_review_responses_delete_seller"
on public.seller_review_responses
for delete
to authenticated
using (seller_id = (select auth.uid()));

drop policy if exists "seller_review_photos_select_public"
on public.seller_review_photos;
drop policy if exists "seller_review_photos_select_buyer"
on public.seller_review_photos;

create policy "seller_review_photos_select_buyer"
on public.seller_review_photos
for select
to authenticated
using (
  public.current_user_owns_seller_review(seller_review_photos.review_id)
);

drop policy if exists "seller_review_photos_insert_buyer"
on public.seller_review_photos;

create policy "seller_review_photos_insert_buyer"
on public.seller_review_photos
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and public.current_user_owns_seller_review(seller_review_photos.review_id)
);

drop policy if exists "seller_review_photos_delete_buyer"
on public.seller_review_photos;

create policy "seller_review_photos_delete_buyer"
on public.seller_review_photos
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and public.current_user_owns_seller_review(seller_review_photos.review_id)
);


create or replace function public.list_listing_sale_buyer_candidates(
  p_listing_id text
)
returns table (
  buyer_id uuid,
  display_name text,
  public_slug text,
  avatar_path text,
  avatar_focus_x smallint,
  avatar_focus_y smallint,
  avatar_zoom smallint,
  last_message_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null
     or safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return;
  end if;

  if not exists (
    select 1
    from public.listings l
    where l.id = safe_listing_id
      and l.owner_id = viewer_id
  ) then
    return;
  end if;

  return query
  select distinct on (c.buyer_id)
    c.buyer_id,
    coalesce(nullif(btrim(p.display_name), ''), c.buyer_display_name, 'Marketplace user')::text,
    p.public_slug,
    p.avatar_path,
    p.avatar_focus_x,
    p.avatar_focus_y,
    p.avatar_zoom,
    c.last_message_at
  from public.conversations c
  join public.profiles p
    on p.id = c.buyer_id
  where c.listing_id = safe_listing_id
    and c.seller_id = viewer_id
    and c.buyer_id <> viewer_id
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = c.id
    )
  order by c.buyer_id, c.last_message_at desc, c.id desc;
end;
$$;


create or replace function public.record_completed_listing_sale(
  p_listing_id text,
  p_buyer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
  listing_record record;
  existing_transaction record;
  transaction_id uuid;
begin
  viewer_id := auth.uid();
  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if viewer_id is null then
    raise exception 'Authenticated user is required to mark a sale';
  end if;

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    raise exception 'Listing is unavailable';
  end if;

  if p_buyer_id is null then
    raise exception 'Buyer is required';
  end if;

  select
    l.id,
    l.owner_id,
    l.title,
    l.category,
    l.subcategory
  into listing_record
  from public.listings l
  where l.id = safe_listing_id;

  if not found or listing_record.owner_id <> viewer_id then
    raise exception 'Only the listing seller can record this sale';
  end if;

  if p_buyer_id = viewer_id then
    raise exception 'Seller cannot be the buyer';
  end if;

  if not exists (
    select 1
    from public.conversations c
    where c.listing_id = safe_listing_id
      and c.seller_id = viewer_id
      and c.buyer_id = p_buyer_id
      and exists (
        select 1
        from public.messages m
        where m.conversation_id = c.id
      )
  ) then
    raise exception 'Buyer must have messaged about this listing';
  end if;

  select clt.id, clt.buyer_id
  into existing_transaction
  from public.completed_listing_transactions clt
  where clt.listing_id = safe_listing_id
  limit 1;

  if found then
    if existing_transaction.buyer_id <> p_buyer_id then
      raise exception 'This listing already has a recorded Charlal buyer';
    end if;

    update public.listings
    set status = 'sold'
    where id = safe_listing_id
      and owner_id = viewer_id;

    return existing_transaction.id;
  end if;

  update public.listings
  set status = 'sold'
  where id = safe_listing_id
    and owner_id = viewer_id;

  insert into public.completed_listing_transactions (
    seller_id,
    buyer_id,
    listing_id,
    listing_title_snapshot,
    listing_category_snapshot,
    listing_subcategory_snapshot
  )
  values (
    viewer_id,
    p_buyer_id,
    safe_listing_id,
    listing_record.title,
    listing_record.category,
    listing_record.subcategory
  )
  returning id into transaction_id;

  return transaction_id;
end;
$$;


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
  review_body text,
  review_created_at timestamptz,
  review_updated_at timestamptz,
  review_photos jsonb
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
    sr.body,
    sr.created_at,
    sr.updated_at,
    coalesce(photo_rows.photos, '[]'::jsonb) as review_photos
  from public.completed_listing_transactions clt
  join public.profiles p
    on p.id = clt.seller_id
  left join public.seller_reviews sr
    on sr.transaction_id = clt.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', srp.id,
        'storage_path', srp.storage_path,
        'position', srp.position,
        'content_type', srp.content_type
      )
      order by srp.position asc, srp.created_at asc
    ) as photos
    from public.seller_review_photos srp
    where srp.review_id = sr.id
  ) photo_rows on true
  where clt.buyer_id = viewer_id
  order by clt.completed_at desc, clt.id desc;
end;
$$;


create or replace function public.get_seller_review_summary(
  p_public_slug text
)
returns table (
  average_rating numeric,
  review_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select
    round(avg(sr.rating)::numeric, 1) as average_rating,
    count(sr.id)::bigint as review_count
  from public.profiles p
  left join public.seller_reviews sr
    on sr.seller_id = p.id
  where p.public_slug = btrim(p_public_slug)
    and p.public_slug ~ '^seller-[a-f0-9]{32}$'
  group by p.id
$$;


create or replace function public.list_public_seller_reviews(
  p_public_slug text,
  p_limit integer default 50
)
returns table (
  review_id uuid,
  rating smallint,
  review_body text,
  review_created_at timestamptz,
  review_updated_at timestamptz,
  listing_title_snapshot text,
  completed_at timestamptz,
  buyer_display_name text,
  buyer_public_slug text,
  buyer_avatar_path text,
  buyer_avatar_focus_x smallint,
  buyer_avatar_focus_y smallint,
  buyer_avatar_zoom smallint,
  response_id uuid,
  response_body text,
  response_created_at timestamptz,
  response_updated_at timestamptz,
  review_photos jsonb
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
    sr.body,
    sr.created_at,
    sr.updated_at,
    clt.listing_title_snapshot,
    clt.completed_at,
    coalesce(nullif(btrim(bp.display_name), ''), 'Marketplace user')::text,
    bp.public_slug,
    bp.avatar_path,
    bp.avatar_focus_x,
    bp.avatar_focus_y,
    bp.avatar_zoom,
    srr.id,
    srr.body,
    srr.created_at,
    srr.updated_at,
    coalesce(photo_rows.photos, '[]'::jsonb) as review_photos
  from public.profiles sp
  join public.seller_reviews sr
    on sr.seller_id = sp.id
  join public.completed_listing_transactions clt
    on clt.id = sr.transaction_id
  join public.profiles bp
    on bp.id = sr.buyer_id
  left join public.seller_review_responses srr
    on srr.review_id = sr.id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', srp.id,
        'storage_path', srp.storage_path,
        'position', srp.position,
        'content_type', srp.content_type
      )
      order by srp.position asc, srp.created_at asc
    ) as photos
    from public.seller_review_photos srp
    where srp.review_id = sr.id
  ) photo_rows on true
  where sp.public_slug = btrim(p_public_slug)
    and sp.public_slug ~ '^seller-[a-f0-9]{32}$'
  order by sr.created_at desc, sr.id desc
  limit safe_limit;
end;
$$;


create or replace function public.delete_own_seller_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to delete a review';
  end if;

  delete from public.seller_reviews sr
  where sr.id = p_review_id
    and sr.buyer_id = viewer_id;
end;
$$;


create or replace function public.list_own_seller_review_photo_paths(
  p_review_id uuid
)
returns table (
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null
     or p_review_id is null then
    return;
  end if;

  if not public.current_user_owns_seller_review(p_review_id) then
    return;
  end if;

  return query
  select srp.storage_path
  from public.seller_review_photos srp
  where srp.review_id = p_review_id
  order by srp.position asc, srp.created_at asc;
end;
$$;


drop policy if exists "review_media_storage_select_public" on storage.objects;

drop policy if exists "review_media_storage_insert_buyer" on storage.objects;
create policy "review_media_storage_insert_buyer"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'review-media'
  and (select auth.uid()) is not null
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  and public.current_user_owns_seller_review_path(name)
);

drop policy if exists "review_media_storage_delete_buyer" on storage.objects;
create policy "review_media_storage_delete_buyer"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'review-media'
  and (select auth.uid()) is not null
  and public.current_user_owns_seller_review_path(name)
);


revoke all on function public.list_listing_sale_buyer_candidates(text) from public;
revoke all on function public.list_listing_sale_buyer_candidates(text) from anon;
grant execute on function public.list_listing_sale_buyer_candidates(text) to authenticated;

revoke all on function public.record_completed_listing_sale(text, uuid) from public;
revoke all on function public.record_completed_listing_sale(text, uuid) from anon;
grant execute on function public.record_completed_listing_sale(text, uuid) to authenticated;

revoke all on function public.list_my_reviewable_transactions() from public;
revoke all on function public.list_my_reviewable_transactions() from anon;
grant execute on function public.list_my_reviewable_transactions() to authenticated;

revoke all on function public.get_seller_review_summary(text) from public;
grant execute on function public.get_seller_review_summary(text) to anon, authenticated;

revoke all on function public.list_public_seller_reviews(text, integer) from public;
grant execute on function public.list_public_seller_reviews(text, integer) to anon, authenticated;

revoke all on function public.current_user_owns_seller_review(uuid) from public;
revoke all on function public.current_user_owns_seller_review(uuid) from anon;
grant execute on function public.current_user_owns_seller_review(uuid) to authenticated;

revoke all on function public.current_user_owns_seller_review_path(text) from public;
revoke all on function public.current_user_owns_seller_review_path(text) from anon;
grant execute on function public.current_user_owns_seller_review_path(text) to authenticated;

revoke all on function public.list_own_seller_review_photo_paths(uuid) from public;
revoke all on function public.list_own_seller_review_photo_paths(uuid) from anon;
grant execute on function public.list_own_seller_review_photo_paths(uuid) to authenticated;

revoke all on function public.delete_own_seller_review(uuid) from public;
revoke all on function public.delete_own_seller_review(uuid) from anon;
grant execute on function public.delete_own_seller_review(uuid) to authenticated;

notify pgrst, 'reload schema';
