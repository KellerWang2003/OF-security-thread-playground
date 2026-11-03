# Shared demo template

**No longer read by the app.** Since 3 November 2026 the Demo button opens a demo built into the app (`src/lib/demo.ts`, artwork drawn in `src/lib/demoArt.ts`), so it changes only with a deploy. The row and its artwork below are left as they were; `tests/cloud-save.test.ts` still opens `demo-template.json` to check that old saves migrate.

Until then, the Demo button opened a copy of the project stored in the `public-demos` workspace (id `82e5f8ec-e552-4bdf-a578-cb3c6a509001`). The app can only read it, so it is changed directly in the database.

- `demo-template.json`: the current template (Demo 1 with the bird frames, Demo 2 with three colour frames, 25° cycle). Its `imageId`s refer to the bird artwork already in the `public-demos` artwork folder.
- `demo-template.previous.json`: the template it replaced (the single "Flappy 25" note), kept for rollback.

To publish an edited template, set the row's `data` to the JSON and give it a new `revision`:

```sql
update public.thread_playground_projects
set data = '<json>'::jsonb, revision = gen_random_uuid(), updated_at = now()
where workspace = 'public-demos' and id = '82e5f8ec-e552-4bdf-a578-cb3c6a509001';
```
