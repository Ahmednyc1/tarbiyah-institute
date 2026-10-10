-- ============================================================================
-- Tarbiyah Institute — who to remind that class is tomorrow
-- ============================================================================
-- The other notifications hang off something a teacher did. A reminder hangs
-- off the calendar, so something has to ask the question once a day with
-- nobody logged in.
--
-- WHY NOT SCHEDULE THE EMAIL WHEN THE SESSION IS PUBLISHED. Two reasons. A
-- scheduled message cannot react to a change: cancel session four and there is
-- already mail queued telling thirty people to turn up, which means tracking
-- every scheduled id and cancelling it correctly, every time. And Resend
-- refuses `scheduled_at` beyond 30 days — a term's later sessions simply could
-- not be scheduled, and would fail silently. Asking "what meets tomorrow?"
-- each morning has nothing to cancel and no horizon.
--
-- This returns one row per RECIPIENT rather than per session, because the
-- caller needs both and a second round trip per class would be worse. The
-- caller groups them.
--
-- `class_roster_email_context` cannot be reused: it checks that the caller
-- teaches the class, and a cron job is nobody. Rather than weaken that check —
-- it is the only thing stopping any signed-in person enumerating student
-- addresses — this is a separate function the service key alone may call.
-- ============================================================================

create or replace function public.sessions_due_tomorrow()
returns table (
  session_id     uuid,
  class_id       uuid,
  session_number integer,
  meets_on       date,
  starts_at      time,
  session_title  text,
  location       text,
  course_code    text,
  course_title   text,
  person_id      uuid,
  first_name     text,
  email          text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.id, cl.id, s.session_number, s.meets_on, s.starts_at, s.title,
    cl.location, co.code, co.title,
    p.id, p.first_name, p.email
  from public.class_sessions s
  join public.classes     cl on cl.id = s.class_id
  join public.courses     co on co.id = cl.course_id
  join public.enrollments e  on e.class_id = cl.id
  join public.students    st on st.id = e.student_id
  join public.people      p  on p.id = st.person_id
  where
    -- Tomorrow in the institute's own timezone, not the server's. A job
    -- running at 13:00 UTC is the morning in Brooklyn; comparing against UTC
    -- "today" would be right for most of the year and wrong around midnight.
    s.meets_on = ((now() at time zone 'America/New_York')::date + 1)
    and s.is_published
    and not s.is_cancelled
    -- A draft or cancelled class has no business emailing anybody.
    and cl.status in ('open', 'in_progress')
    and e.status <> 'dropped'
    and p.email is not null
  order by co.code, s.session_number, p.first_name;
$$;

comment on function public.sessions_due_tomorrow is
  'One row per student who has a published, uncancelled session tomorrow. '
  'Service key only — the caller is a scheduled job with no user behind it.';

revoke execute on function public.sessions_due_tomorrow() from public, anon, authenticated;
grant  execute on function public.sessions_due_tomorrow() to service_role;
