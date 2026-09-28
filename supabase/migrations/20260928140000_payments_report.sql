-- ============================================================================
-- Tarbiyah Institute — the payments report finance reconciles against
-- ============================================================================
-- One row per payment, flattened, for a date range. The finance manager pulls
-- this monthly and matches it against the Stripe payout and the bank.
--
-- The dates are the reason this is a function rather than a query from the
-- page. paid_at is timestamptz, stored in UTC. A payment taken at the desk at
-- 8pm on 31 March in Brooklyn is 1 April in UTC, so a naive range filter puts
-- it in the wrong month — at precisely the boundary where the report and the
-- bank statement are compared. The day is therefore decided in New York time,
-- where the money actually changed hands.
--
-- SECURITY INVOKER: an admin sees everything, a student sees their own, and
-- the RLS policies on payments decide which — this adds no access of its own.
-- ============================================================================

create or replace function public.payments_report(
  p_from date,
  p_to   date
)
returns table (
  payment_id     uuid,
  paid_at        timestamptz,
  local_date     date,
  student_name   text,
  student_number text,
  course_code    text,
  course_title   text,
  term           text,
  amount         numeric,
  method         text,
  reference      text,
  note           text,
  recorded_by    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pay.id,
    pay.paid_at,
    (pay.paid_at at time zone 'America/New_York')::date,
    trim(coalesce(pe.title || ' ', '') || pe.first_name || ' ' || pe.last_name),
    st.student_number,
    co.code,
    co.title,
    cl.term,
    pay.amount,
    pay.method,
    pay.reference,
    pay.note,
    case when rb.id is null then null
         else trim(rb.first_name || ' ' || rb.last_name) end
  from public.payments pay
  join public.enrollments e  on e.id  = pay.enrollment_id
  join public.students    st on st.id = e.student_id
  join public.people      pe on pe.id = st.person_id
  join public.classes     cl on cl.id = e.class_id
  join public.courses     co on co.id = cl.course_id
  left join public.people rb on rb.id = pay.recorded_by
  where (pay.paid_at at time zone 'America/New_York')::date between p_from and p_to
  order by pay.paid_at, pe.last_name;
$$;

comment on function public.payments_report is
  'Every payment in a date range, itemised, for monthly reconciliation. Days '
  'are New York days, not UTC ones, so the boundaries match the bank.';

grant execute on function public.payments_report(date, date) to authenticated;


-- ---------------------------------------------------------------------------
-- Waived fees — income that was never going to arrive
-- ---------------------------------------------------------------------------
-- Without this a waived seat looks identical to an unpaid one, and finance
-- spends the month chasing a debt the sheikh forgave.
--
-- Not filtered by date: a waiver has no timestamp of its own. It is a standing
-- decision about a place on a course, so the whole current picture is shown.
create or replace function public.waived_fees()
returns table (
  enrollment_id  uuid,
  student_name   text,
  student_number text,
  course_code    text,
  course_title   text,
  term           text,
  amount_due     numeric,
  amount_paid    numeric,
  waiver_note    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    trim(coalesce(pe.title || ' ', '') || pe.first_name || ' ' || pe.last_name),
    st.student_number,
    co.code,
    co.title,
    cl.term,
    e.amount_due,
    e.amount_paid,
    e.waiver_note
  from public.enrollments e
  join public.students st on st.id = e.student_id
  join public.people   pe on pe.id = st.person_id
  join public.classes  cl on cl.id = e.class_id
  join public.courses  co on co.id = cl.course_id
  where e.payment_status = 'waived'
    and e.status <> 'dropped'
  order by cl.term, co.code, pe.last_name;
$$;

comment on function public.waived_fees is
  'Places given without charge, with the reason. Shown beside the payments '
  'report so a waived seat is not mistaken for an unpaid one.';

grant execute on function public.waived_fees() to authenticated;
