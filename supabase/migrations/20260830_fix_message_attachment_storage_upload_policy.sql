begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

create or replace function private.current_user_message_attachment_uploads_below_limit()
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  viewer_id uuid;
begin
  viewer_id := auth.uid();

  if viewer_id is null then
    return false;
  end if;

  return (
    select count(*) < 100
    from storage.objects so
    where so.bucket_id = 'message-attachments'
      and so.owner_id = viewer_id::text
      and so.created_at > now() - interval '1 day'
  );
end;
$$;

alter function private.current_user_message_attachment_uploads_below_limit()
owner to postgres;

revoke all
on function private.current_user_message_attachment_uploads_below_limit()
from public;

revoke all
on function private.current_user_message_attachment_uploads_below_limit()
from anon;

grant execute
on function private.current_user_message_attachment_uploads_below_limit()
to authenticated;

drop policy if exists "message_attachments_storage_insert_participant"
on storage.objects;

create policy "message_attachments_storage_insert_participant"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-attachments'
  and (select auth.uid()) is not null
  and owner_id = (select auth.uid())::text

  and name ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'

  and array_length(
    storage.foldername(name),
    1
  ) = 2

  and lower(
    storage.extension(name)
  ) in (
    'jpg',
    'jpeg',
    'png',
    'webp'
  )

  and private.current_user_message_attachment_uploads_below_limit()

  and exists (
    select 1
    from public.conversations c
    where c.id::text = (
      storage.foldername(name)
    )[1]
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
  )
);

notify pgrst, 'reload schema';

commit;
