do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_reads'
  ) then
    alter publication supabase_realtime add table public.conversation_reads;
  end if;
end;
$$;

drop policy if exists "conversation_reads_select_own_participant" on public.conversation_reads;
drop policy if exists "conversation_reads_select_conversation_participants" on public.conversation_reads;

create policy "conversation_reads_select_conversation_participants"
on public.conversation_reads
for select
to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_reads.conversation_id
      and (
        c.buyer_id = (select auth.uid())
        or c.seller_id = (select auth.uid())
      )
      and (
        conversation_reads.user_id = c.buyer_id
        or conversation_reads.user_id = c.seller_id
      )
  )
);
