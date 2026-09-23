-- ============================================================================
-- Tarbiyah Institute — instructor photographs
-- ============================================================================
-- The file lives in Storage, not in Postgres. Only the object path is stored
-- here: images in the database bloat every backup, miss the CDN, and cost an
-- API round trip per render.
--
-- The column sits on `teachers`, not `people`, because a teacher's photograph
-- is published on the public catalogue while a student's never should be. Same
-- boundary that teacher_directory already draws.
-- ============================================================================

alter table public.teachers
  add column if not exists photo_path text
    check (photo_path is null or length(trim(photo_path)) > 0);

comment on column public.teachers.photo_path is
  'Object path inside the public `teacher-photos` bucket, e.g. '
  '"badawy.jpg". Not a full URL — the host is composed at render time.';


-- ---------------------------------------------------------------------------
-- The bucket: world-readable, admin-writable
-- ---------------------------------------------------------------------------
-- Public read is the point — these appear on pages anonymous visitors see.
-- Writes are locked to admins so nobody can replace an instructor's portrait.

insert into storage.buckets (id, name, public)
values ('teacher-photos', 'teacher-photos', true)
on conflict (id) do nothing;

drop policy if exists "teacher photos are publicly readable" on storage.objects;
create policy "teacher photos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'teacher-photos');

drop policy if exists "admins manage teacher photos" on storage.objects;
create policy "admins manage teacher photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'teacher-photos' and app.is_admin())
  with check (bucket_id = 'teacher-photos' and app.is_admin());


-- ---------------------------------------------------------------------------
-- Surface it on the public directory
-- ---------------------------------------------------------------------------

create or replace view public.teacher_directory as
  select
    t.id,
    t.person_id,
    trim(coalesce(p.title || ' ', '') || p.first_name || ' ' || p.last_name) as full_name,
    t.bio,
    t.photo_path
  from public.teachers t
  join public.people   p on p.id = t.person_id
 where t.is_active;

alter view public.teacher_directory set (security_invoker = off);
grant select on public.teacher_directory to anon, authenticated;
