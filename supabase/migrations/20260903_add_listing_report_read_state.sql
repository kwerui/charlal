begin;

create or replace function public.has_reported_listing(
  p_listing_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer_id uuid;
  safe_listing_id text;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return false;
  end if;

  safe_listing_id := btrim(coalesce(p_listing_id, ''));

  if safe_listing_id = ''
     or safe_listing_id ~ '^[0-9]+$' then
    return false;
  end if;

  return exists (
    select 1
    from public.listing_reports lr
    where lr.reporter_id = viewer_id
      and lr.listing_reference = safe_listing_id
  );
end;
$$;

revoke all on function public.has_reported_listing(text) from public;
revoke all on function public.has_reported_listing(text) from anon;
grant execute on function public.has_reported_listing(text) to authenticated;

notify pgrst, 'reload schema';

commit;
