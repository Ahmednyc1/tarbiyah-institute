-- ============================================================================
-- Tarbiyah Institute — publish instructors without an elevated view
-- ============================================================================
-- teacher_directory was SECURITY DEFINER so it could read `people` and
-- `teachers`, which anonymous visitors cannot. That works, but the boundary was
-- the view's SELECT list — a convention, enforced by nobody. Edit the view
-- carelessly and you publish phone numbers.
--
-- Column-level grants move that boundary into Postgres. `anon` is given SELECT
-- on exactly the columns an instructor profile needs and no others, with
-- policies restricting it to active teachers. Then the view can run as the
-- caller: same output, one less elevated object, and the protection no longer
-- depends on anyone remembering why.
--
-- Adding email to the view later would now fail with "permission denied for
-- column", which is the point.
-- ============================================================================

-- Only display columns. Notably absent from people: email, phone,
-- date_of_birth, auth_user_id.
grant select (id, person_id, bio, photo_path, is_active) on public.teachers to anon;
grant select (id, title, first_name, last_name)          on public.people   to anon;

drop policy if exists teachers_read_public on public.teachers;
create policy teachers_read_public on public.teachers
  for select to anon
  using (is_active);

-- Anonymous visitors reach a person only by way of an active teacher record.
-- A student's row stays invisible no matter what.
drop policy if exists people_read_active_teachers on public.people;
create policy people_read_active_teachers on public.people
  for select to anon
  using (
    exists (
      select 1
        from public.teachers t
       where t.person_id = people.id
         and t.is_active
    )
  );

alter view public.teacher_directory set (security_invoker = on);

comment on view public.teacher_directory is
  'Instructor profiles for the public catalogue. Runs as the caller: anon holds '
  'column-level SELECT on display columns only, so contact details cannot leak '
  'even if this view is edited.';
