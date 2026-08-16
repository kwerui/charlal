create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id),
  seller_id uuid not null references auth.users(id),
  listing_id text references public.listings(id) on delete set null,
  listing_reference text not null,
  listing_title_snapshot text not null,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),

  constraint listing_reports_reporter_not_seller
    check (reporter_id <> seller_id),
  constraint listing_reports_listing_reference_not_blank
    check (length(btrim(listing_reference)) > 0),
  constraint listing_reports_title_snapshot_not_blank
    check (length(btrim(listing_title_snapshot)) > 0),
  constraint listing_reports_reason_valid check (
    reason in (
      'scam',
      'prohibited_item',
      'misleading',
      'duplicate_spam',
      'other'
    )
  ),
  constraint listing_reports_details_length check (
    details is null or char_length(details) <= 1000
  )
);

create unique index if not exists listing_reports_one_per_listing_reference_idx
on public.listing_reports (reporter_id, listing_reference);

create index if not exists listing_reports_listing_reference_created_idx
on public.listing_reports (listing_reference, created_at desc);

create index if not exists listing_reports_seller_created_idx
on public.listing_reports (seller_id, created_at desc);

alter table public.listing_reports enable row level security;

revoke all on public.listing_reports from anon;
revoke all on public.listing_reports from authenticated;
revoke all on public.listing_reports from public;


create or replace function public.report_listing(
  p_listing_id text,
  p_reason text,
  p_details text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
  safe_reason text;
  safe_details text;
  listing_record record;
  report_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    raise exception 'Authenticated user is required to report a listing';
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));
  safe_reason := btrim(coalesce(p_reason, ''));
  safe_details := nullif(btrim(coalesce(p_details, '')), '');

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    raise exception 'Listing is unavailable';
  end if;

  if safe_reason not in (
    'scam',
    'prohibited_item',
    'misleading',
    'duplicate_spam',
    'other'
  ) then
    raise exception 'Report reason is required';
  end if;

  if safe_details is not null and char_length(safe_details) > 1000 then
    raise exception 'Report details are too long';
  end if;

  select l.id, l.owner_id, l.title
  into listing_record
  from public.listings l
  where l.id = safe_listing_id;

  if not found then
    raise exception 'Listing is unavailable';
  end if;

  if listing_record.owner_id = viewer_id then
    raise exception 'You cannot report your own listing';
  end if;

  insert into public.listing_reports (
    reporter_id,
    seller_id,
    listing_id,
    listing_reference,
    listing_title_snapshot,
    reason,
    details
  )
  values (
    viewer_id,
    listing_record.owner_id,
    listing_record.id,
    listing_record.id,
    btrim(listing_record.title),
    safe_reason,
    safe_details
  )
  on conflict (reporter_id, listing_reference) do nothing
  returning id into report_id;

  if report_id is null then
    return 'already_reported';
  end if;

  return 'created';
end;
$$;

revoke all on function public.report_listing(text, text, text) from public;
revoke all on function public.report_listing(text, text, text) from anon;
grant execute on function public.report_listing(text, text, text) to authenticated;

notify pgrst, 'reload schema';
