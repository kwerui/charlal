create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint profiles_display_name_length check (char_length(display_name) <= 80),
  constraint profiles_display_name_not_email check (
    display_name !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create or replace function public.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profile_updated_at();

create or replace function public.prevent_profile_id_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.id <> old.id then
    raise exception 'Profile id cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_id_change on public.profiles;
create trigger profiles_prevent_id_change
before update on public.profiles
for each row
execute function public.prevent_profile_id_change();

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  safe_display_name text;
begin
  safe_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');

  if safe_display_name is null or safe_display_name ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    safe_display_name := 'Marketplace user';
  end if;

  safe_display_name := left(safe_display_name, 80);

  insert into public.profiles (id, display_name)
  values (new.id, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_user_profile();

alter table public.profiles enable row level security;

revoke all on public.profiles from anon;
revoke all on public.profiles from public;
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
