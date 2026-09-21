-- ============================================================================
-- Tarbiyah Institute — Row Level Security
-- ============================================================================
-- Run AFTER 20260921120000_initial_schema.sql.
--
-- Because "Automatically expose new tables" is OFF on this project, the API
-- roles have no privileges on new tables at all. So this file does two things:
--   1. GRANTs — decide which tables the API can touch.
--   2. POLICIES — decide which ROWS each person can touch.
-- You need both. A table with policies but no grant returns nothing; a table
-- with a grant but no policies (with RLS on) also returns nothing.
--
-- Three roles:
--   admin    — a row in public.admins. Full access.
--   teacher  — sees and manages only their own classes.
--   student  — sees only their own enrollment, work and certificates.
--   anon     — public catalogue only (courses + open classes).
-- ============================================================================


-- ============================================================================
-- 1. HELPER FUNCTIONS
-- ============================================================================
-- SECURITY DEFINER so they can read tables the caller can't, and STABLE so
-- Postgres calls them once per query instead of once per row.

grant usage on schema app to anon, authenticated;

create or replace function app.current_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.people p
   where p.auth_user_id = (select auth.uid());
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.admins a
      join public.people p on p.id = a.person_id
     where p.auth_user_id = (select auth.uid())
  );
$$;

create or replace function app.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
    from public.teachers t
    join public.people p on p.id = t.person_id
   where p.auth_user_id = (select auth.uid());
$$;

create or replace function app.current_student_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.id
    from public.students s
    join public.people p on p.id = s.person_id
   where p.auth_user_id = (select auth.uid());
$$;

-- Does the caller teach this class?
create or replace function app.teaches_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.classes c
     where c.id = p_class_id
       and c.teacher_id = app.current_teacher_id()
  );
$$;

-- Is the caller a (non-dropped) student in this class?
create or replace function app.is_enrolled(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
     where e.class_id = p_class_id
       and e.student_id = app.current_student_id()
       and e.status <> 'dropped'
  );
$$;

-- Does the caller own this enrollment row?
create or replace function app.owns_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
     where e.id = p_enrollment_id
       and e.student_id = app.current_student_id()
  );
$$;

-- Does the caller teach the class this enrollment belongs to?
create or replace function app.teaches_enrollment(p_enrollment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.enrollments e
      join public.classes c on c.id = e.class_id
     where e.id = p_enrollment_id
       and c.teacher_id = app.current_teacher_id()
  );
$$;

grant execute on all functions in schema app to anon, authenticated;


-- ============================================================================
-- 2. ENABLE RLS EVERYWHERE
-- ============================================================================
-- The project's automatic-RLS trigger should already have done this; running it
-- again is harmless and makes the migration self-contained.

alter table public.people           enable row level security;
alter table public.teachers         enable row level security;
alter table public.students         enable row level security;
alter table public.admins           enable row level security;
alter table public.courses          enable row level security;
alter table public.classes          enable row level security;
alter table public.enrollments      enable row level security;
alter table public.grade_categories enable row level security;
alter table public.assignments      enable row level security;
alter table public.student_grades   enable row level security;
alter table public.attendance       enable row level security;
alter table public.certificates     enable row level security;


-- ============================================================================
-- 3. GRANTS
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- Public catalogue.
grant select on public.courses to anon, authenticated;
grant select on public.classes to anon, authenticated;

-- Signed-in users. RLS narrows these down to the right rows.
grant select                         on public.people           to authenticated;
grant select                         on public.teachers         to authenticated;
grant select                         on public.students         to authenticated;
grant select                         on public.grade_categories to authenticated;
grant select                         on public.assignments      to authenticated;
grant select                         on public.certificates     to authenticated;
grant select, update                 on public.enrollments      to authenticated;
grant select, insert, update, delete on public.student_grades   to authenticated;
grant select, insert, update, delete on public.attendance       to authenticated;
grant select                         on public.enrollment_grades to authenticated;

-- Admin-only writes go through the service_role key on your server, or you can
-- add INSERT/DELETE grants here later once the admin UI exists.
grant insert, update, delete on public.people           to authenticated;
grant insert, update, delete on public.teachers         to authenticated;
grant insert, update, delete on public.students         to authenticated;
grant insert, update, delete on public.courses          to authenticated;
grant insert, update, delete on public.classes          to authenticated;
grant insert, delete         on public.enrollments      to authenticated;
grant insert, update, delete on public.grade_categories to authenticated;
grant insert, update, delete on public.assignments      to authenticated;
grant insert, update, delete on public.certificates     to authenticated;

-- Views run as their owner unless told otherwise. This makes the view respect
-- the *caller's* RLS instead of bypassing it — important for a grades view.
alter view public.enrollment_grades set (security_invoker = on);

-- Nothing gets the admins table via the API. Manage it in the SQL editor.
revoke all on public.admins from anon, authenticated;


-- ============================================================================
-- 4. POLICIES
-- ============================================================================

-- ---- people ---------------------------------------------------------------
create policy people_admin_all on public.people
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy people_read_self on public.people
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

create policy people_update_self on public.people
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- A teacher may read the people-records of students in their classes.
create policy people_read_by_their_teacher on public.people
  for select to authenticated
  using (
    exists (
      select 1
        from public.students  s
        join public.enrollments e on e.student_id = s.id
        join public.classes     c on c.id = e.class_id
       where s.person_id = people.id
         and c.teacher_id = app.current_teacher_id()
    )
  );

-- ---- teachers -------------------------------------------------------------
create policy teachers_admin_all on public.teachers
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Teacher bios are visible to any signed-in user (needed for the catalogue).
create policy teachers_read_all on public.teachers
  for select to authenticated using (true);

create policy teachers_update_own on public.teachers
  for update to authenticated
  using (person_id = app.current_person_id())
  with check (person_id = app.current_person_id());

-- ---- students -------------------------------------------------------------
create policy students_admin_all on public.students
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy students_read_self on public.students
  for select to authenticated
  using (person_id = app.current_person_id());

create policy students_read_by_their_teacher on public.students
  for select to authenticated
  using (
    exists (
      select 1
        from public.enrollments e
        join public.classes c on c.id = e.class_id
       where e.student_id = students.id
         and c.teacher_id = app.current_teacher_id()
    )
  );

-- ---- courses --------------------------------------------------------------
create policy courses_admin_all on public.courses
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy courses_read_active on public.courses
  for select to anon, authenticated using (is_active);

-- ---- classes --------------------------------------------------------------
create policy classes_admin_all on public.classes
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- Public sees open classes only — drafts and cancelled ones stay hidden.
create policy classes_read_open on public.classes
  for select to anon, authenticated
  using (status in ('open', 'in_progress'));

create policy classes_read_own_teaching on public.classes
  for select to authenticated
  using (teacher_id = app.current_teacher_id());

create policy classes_read_own_enrolled on public.classes
  for select to authenticated
  using (app.is_enrolled(id));

-- A teacher may edit their own class, but not reassign it to someone else.
create policy classes_update_own on public.classes
  for update to authenticated
  using (teacher_id = app.current_teacher_id())
  with check (teacher_id = app.current_teacher_id());

-- ---- enrollments ----------------------------------------------------------
-- Note: only admins write these. Money and roster changes are not a
-- self-service operation.
create policy enrollments_admin_all on public.enrollments
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy enrollments_read_own on public.enrollments
  for select to authenticated
  using (student_id = app.current_student_id());

create policy enrollments_read_by_teacher on public.enrollments
  for select to authenticated
  using (app.teaches_class(class_id));

-- ---- grade_categories -----------------------------------------------------
create policy grade_categories_admin_all on public.grade_categories
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy grade_categories_manage_own_class on public.grade_categories
  for all to authenticated
  using (app.teaches_class(class_id))
  with check (app.teaches_class(class_id));

create policy grade_categories_read_enrolled on public.grade_categories
  for select to authenticated
  using (app.is_enrolled(class_id));

-- ---- assignments ----------------------------------------------------------
create policy assignments_admin_all on public.assignments
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy assignments_manage_own_class on public.assignments
  for all to authenticated
  using (app.teaches_class(class_id))
  with check (app.teaches_class(class_id));

-- Students see published assignments only, so a teacher can draft ahead.
create policy assignments_read_enrolled on public.assignments
  for select to authenticated
  using (is_published and app.is_enrolled(class_id));

-- ---- student_grades -------------------------------------------------------
create policy student_grades_admin_all on public.student_grades
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy student_grades_manage_by_teacher on public.student_grades
  for all to authenticated
  using (app.teaches_class(class_id))
  with check (app.teaches_class(class_id));

create policy student_grades_read_own on public.student_grades
  for select to authenticated
  using (app.owns_enrollment(enrollment_id));

-- ---- attendance -----------------------------------------------------------
create policy attendance_admin_all on public.attendance
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy attendance_manage_by_teacher on public.attendance
  for all to authenticated
  using (app.teaches_enrollment(enrollment_id))
  with check (app.teaches_enrollment(enrollment_id));

create policy attendance_read_own on public.attendance
  for select to authenticated
  using (app.owns_enrollment(enrollment_id));

-- ---- certificates ---------------------------------------------------------
create policy certificates_admin_all on public.certificates
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy certificates_read_own on public.certificates
  for select to authenticated
  using (app.owns_enrollment(enrollment_id));

create policy certificates_read_by_teacher on public.certificates
  for select to authenticated
  using (app.teaches_enrollment(enrollment_id));


-- ============================================================================
-- 5. AUTO-CREATE A PEOPLE ROW ON SIGNUP
-- ============================================================================
-- Without this, a new Auth user has no `people` row, so every policy above
-- evaluates to false and they see an empty app.

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Pending'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'),  ''), 'Pending'),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'sex', 'male')
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

comment on function app.handle_new_auth_user is
  'Pass first_name/last_name/sex in signUp options.data so this fills correctly.';
