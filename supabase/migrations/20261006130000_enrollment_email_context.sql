-- ============================================================================
-- Tarbiyah Institute — what a confirmation email needs to know
-- ============================================================================
-- The webhook sends the "you are registered" email, and to write it needs the
-- student's name and address, the course title, when it meets and what was
-- paid. It can reach none of that: service_role holds grants on seat_holds and
-- payments only, which is correct and worth keeping.
--
-- The lazy fix is to grant service_role SELECT on people, students, classes
-- and courses. That trades a precise hole for a broad one — the key that
-- bypasses every policy would then be able to read the whole directory, for
-- the sake of one line in one email.
--
-- This is the narrow version: one function, one enrollment, exactly the eleven
-- values an email template uses. SECURITY DEFINER so it can read across those
-- tables, and callable only with the service key.
--
-- Reusable for the other notifications — grades published, a recording posted
-- — which need the same student-and-course context from the same starting
-- point.
-- ============================================================================

drop function if exists public.enrollment_email_context(uuid);

create function public.enrollment_email_context(p_enrollment_id uuid)
returns table (
  person_id        uuid,
  first_name       text,
  full_name        text,
  email            text,
  course_code      text,
  course_title     text,
  term             text,
  meeting_schedule text,
  location         text,
  start_date       date,
  amount_due       numeric,
  amount_paid      numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    -- Addressed by first name; greeting somebody by their full name with
    -- title reads like a form letter. Taken from the column rather than
    -- sliced out of the full name, which guesses wrong on a name of more
    -- than two parts.
    p.first_name,
    -- The name as it would be spoken, title included where there is one.
    trim(both ' ' from concat_ws(' ', p.title, p.first_name, p.last_name)),
    p.email,
    co.code,
    co.title,
    cl.term,
    cl.meeting_schedule,
    cl.location,
    cl.start_date,
    e.amount_due,
    e.amount_paid
  from public.enrollments e
  join public.students s  on s.id  = e.student_id
  join public.people   p  on p.id  = s.person_id
  join public.classes  cl on cl.id = e.class_id
  join public.courses  co on co.id = cl.course_id
  where e.id = p_enrollment_id;
$$;

comment on function public.enrollment_email_context is
  'The student-and-course details a notification email needs, for one '
  'enrollment. Service key only — it reads across people and classes, which '
  'the webhook is otherwise and deliberately unable to do.';

-- Postgres grants EXECUTE to PUBLIC by default, and this one reads names and
-- email addresses. Taken away first, then given back to the one caller.
revoke execute on function public.enrollment_email_context(uuid) from public, anon, authenticated;
grant  execute on function public.enrollment_email_context(uuid) to service_role;
