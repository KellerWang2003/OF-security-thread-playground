begin;

-- Namespaced so this app can share General playground with other experiments.
create table public.thread_playground_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_id_matches_data check (data ->> 'id' = id::text)
);
create index thread_playground_projects_owner_idx
  on public.thread_playground_projects (owner_id, updated_at desc);

alter table public.thread_playground_projects enable row level security;
revoke all on public.thread_playground_projects from anon, authenticated;
grant select, insert, update on public.thread_playground_projects to authenticated;

create policy "Read own thread projects" on public.thread_playground_projects
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Create own thread projects" on public.thread_playground_projects
  for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Update own thread projects" on public.thread_playground_projects
  for update to authenticated using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Invoker permissions retain RLS. A revision change is mandatory for every edit.
create function public.thread_playground_stamp_update() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.id <> old.id or new.owner_id <> old.owner_id then
    raise exception 'Project identity cannot be changed';
  end if;
  if new.revision = old.revision then
    raise exception 'A new project revision is required';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.thread_playground_stamp_update() from public, anon, authenticated;
create trigger thread_playground_stamp_update
  before update on public.thread_playground_projects
  for each row execute function public.thread_playground_stamp_update();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thread-playground-artwork', 'thread-playground-artwork', false, 26214400,
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']);

-- Immutable UUID artwork, scoped to an account. No public URLs or client overwrites.
create policy "Read own thread artwork" on storage.objects
  for select to authenticated using (
    bucket_id = 'thread-playground-artwork' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Upload own thread artwork" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'thread-playground-artwork' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;
