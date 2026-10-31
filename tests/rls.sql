-- Backend invariants for username workspaces. All fixtures roll back.
begin;
insert into public.thread_playground_projects (id, workspace, name, data, revision) values (
  'c8856c56-6c18-40c3-8bab-648f848862b1', 'sql-smoke-test', 'Scope test',
  '{"id":"c8856c56-6c18-40c3-8bab-648f848862b1","notes":[]}', 'c8856c56-6c18-40c3-8bab-648f848862c1'
);
do $$
declare changed int;
begin
  assert not has_table_privilege('anon', 'public.thread_playground_projects', 'SELECT'), 'Anonymous table access is granted';
  assert not has_table_privilege('anon', 'public.thread_playground_projects', 'INSERT'), 'Anonymous insert access is granted';
  assert (select not public from storage.buckets where id = 'thread-playground-artwork'), 'Artwork bucket is public';
  assert not exists (select 1 from pg_policies where schemaname = 'storage' and policyname in ('Read shared thread artwork', 'Upload shared thread artwork')), 'Unscoped artwork policy exists';
  update public.thread_playground_projects set name = 'Updated', revision = 'c8856c56-6c18-40c3-8bab-648f848862c2'
    where id = 'c8856c56-6c18-40c3-8bab-648f848862b1' and revision = 'c8856c56-6c18-40c3-8bab-648f848862c1';
  get diagnostics changed = row_count;
  assert changed = 1, 'Revision update failed';
  update public.thread_playground_projects set name = 'Stale', revision = gen_random_uuid()
    where id = 'c8856c56-6c18-40c3-8bab-648f848862b1' and revision = 'c8856c56-6c18-40c3-8bab-648f848862c1';
  get diagnostics changed = row_count;
  assert changed = 0, 'Stale revision overwrote a newer edit';
  begin
    update public.thread_playground_projects set workspace = 'another-workspace', revision = gen_random_uuid()
      where id = 'c8856c56-6c18-40c3-8bab-648f848862b1';
    raise exception 'Project was moved to a different workspace';
  exception when raise_exception then
    assert sqlerrm = 'Project identity cannot be changed';
  end;
end $$;
rollback;
select 'Direct API access denied, immutable workspace IDs, and stale-write protection passed; fixtures rolled back.' as result;
