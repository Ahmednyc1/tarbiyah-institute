-- ============================================================================
-- Tarbiyah Institute — who to tell that a mark is out
-- ============================================================================
-- The session notification went to the whole roster, because a recording is
-- the same recording for everybody. A mark is not.
--
-- Publishing an assignment is not the same act as marking it. A teacher may
-- publish on the day it is set and mark a week later; they may publish with
-- half the class marked. Writing to the whole roster would tell people their
-- mark is available when it is not, and send them to a portal to find an empty
-- row — which is worse than silence, because they will ask about it.
--
-- So the audience is narrower than the class: the students who actually have a
-- score on this assignment. Nobody else is told anything, and when the rest are
-- marked, the teacher is in exactly the position this is designed around — a
-- mark that exists and a student who has not been told.
--
-- NOTE ON THAT LAST POINT: because `emails` records one row per recipient
-- against the assignment, a second publish can tell the students who were
-- marked later without telling the first group twice. The send site filters on
-- what has already gone out.
-- ============================================================================

create or replace function public.assignment_marked_recipients(p_assignment_id uuid)
returns table (
  person_id  uuid,
  first_name text,
  email      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class uuid;
begin
  select a.class_id into v_class from public.assignments a where a.id = p_assignment_id;
  if v_class is null then
    return;                      -- no such assignment: nobody to tell
  end if;

  -- SECURITY DEFINER reads past every policy, so the check lives here. Without
  -- it this is a way to enumerate the address of every student who has ever
  -- been marked, one assignment at a time.
  if not (app.teaches_class(v_class) or app.is_admin()) then
    raise exception 'You do not teach that class'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id, p.first_name, p.email
      from public.student_grades sg
      join public.enrollments e on e.id = sg.enrollment_id
      join public.students    s on s.id = e.student_id
      join public.people      p on p.id = s.person_id
     where sg.assignment_id = p_assignment_id
       -- A row with a null score is a placeholder, not a mark.
       and sg.score is not null
       and e.status <> 'dropped'
       and p.email is not null
     order by p.first_name;
end;
$$;

comment on function public.assignment_marked_recipients is
  'Addresses of the students who actually have a mark on one assignment. '
  'Narrower than the roster on purpose: publishing is not marking. Checks '
  'inside that the caller teaches the class.';

revoke execute on function public.assignment_marked_recipients(uuid) from public, anon;
grant  execute on function public.assignment_marked_recipients(uuid) to authenticated, service_role;
