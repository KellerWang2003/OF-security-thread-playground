begin;

-- Deliberately shared, password-free workspaces for a small group of friends.
-- A username selects a workspace; it is not an authentication credential.
-- Requests must go through the scoped workspace API, never unrestricted table policies.
drop policy "Read own thread projects" on public.thread_playground_projects;
drop policy "Create own thread projects" on public.thread_playground_projects;
drop policy "Update own thread projects" on public.thread_playground_projects;
drop index public.thread_playground_projects_owner_idx;
alter table public.thread_playground_projects drop constraint thread_playground_projects_owner_id_fkey;
alter table public.thread_playground_projects alter column owner_id type text using owner_id::text;
alter table public.thread_playground_projects rename column owner_id to workspace;
alter table public.thread_playground_projects add constraint workspace_name_valid
  check (workspace ~ '^[a-z0-9][a-z0-9_-]{1,63}$');
create index thread_playground_projects_workspace_idx
  on public.thread_playground_projects (workspace, updated_at desc);

-- Only the workspace API can access these rows. It explicitly scopes every operation by username.
revoke all on public.thread_playground_projects from anon, authenticated;
grant select, insert, update on public.thread_playground_projects to service_role;

create or replace function public.thread_playground_stamp_update() returns trigger
  language plpgsql security invoker set search_path = '' as $$
begin
  if new.id <> old.id or new.workspace <> old.workspace then
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

drop policy "Read own thread artwork" on storage.objects;
drop policy "Upload own thread artwork" on storage.objects;
-- Artwork stays inaccessible through the anonymous Storage API. The workspace API
-- reads/uploads only the requested username's folder; it does not offer folder listings.

commit;
