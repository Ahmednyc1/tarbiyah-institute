-- ============================================================================
-- Tarbiyah Institute — a class is a series of meetings, not a sentence
-- ============================================================================
-- `classes.meeting_schedule` is the string "Mondays 9:00pm - 11:00pm". Nothing
-- knows a course has eight meetings, when they are, or which is which.
--
-- Three things follow from that. The register asks a teacher to TYPE a date,
-- so one slip invents a session that exists for a single student and quietly
-- lowers their attendance grade, with nothing to flag it. A recording belongs
-- to a meeting, and meetings do not exist. And a class cancelled for Eid is
-- indistinguishable from a register nobody took.
--
-- Sessions fix all three. Attendance moves from a typed date to a session id,
-- which is free to do today — the table is empty — and would mean migrating
-- live registers mid-term if left.
--
-- A cancelled session keeps its row. Deleting it would lose the fact that the
-- class was MEANT to meet, which is the question a student asks when the term
-- had seven weeks instead of eight. It is excluded from the attendance
-- denominator instead, so nobody is marked down for a class that did not run.
-- ============================================================================

create table public.class_sessions (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes (id) on delete cascade,

  -- What the sheikh calls it out loud: "session three".
  session_number integer not null check (session_number > 0),

  meets_on       date not null,
  starts_at      time,
  ends_at        time,

  title          text,
  summary        text,

  -- Deliberately a URL, not a file. The recording lives on YouTube; storing
  -- the address means the provider can change without moving a single video.
  recording_url  text check (recording_url is null or recording_url ~* '^https?://'),
  slides_path    text,

  is_cancelled   boolean not null default false,

  -- Off until somebody says otherwise: a link pasted mid-upload should not
  -- appear to thirty students the moment it is saved.
  is_published   boolean not null default false,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint class_sessions_number_unique unique (class_id, session_number),

  -- Nothing collects an end time yet, but the column exists and a later form
  -- will. Cheaper to forbid 11pm–9am now than to find it in a timetable.
  constraint class_sessions_times_ordered
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

-- Not unique on the date: an intensive can meet twice in a day, and a
-- rescheduled session may land on one already used.
create index class_sessions_class_idx on public.class_sessions (class_id, meets_on);

create trigger set_updated_at before update on public.class_sessions
  for each row execute function extensions.moddatetime(updated_at);

comment on table public.class_sessions is
  'One row per meeting of a class. Attendance hangs off these rather than off '
  'a date somebody typed.';


-- ---------------------------------------------------------------------------
-- Attendance belongs to a session
-- ---------------------------------------------------------------------------
-- The table is empty, so this is a straight replacement rather than a
-- migration. Were there rows, each would need a session inventing first.
-- Both grade views read attendance.class_date, so the column cannot go while
-- they exist. They are rebuilt at the bottom of this file, enrollment_grades
-- unchanged and enrollment_category_scores with sessions joined in.
drop view if exists public.enrollment_grades;
drop view if exists public.enrollment_category_scores;

alter table public.attendance drop constraint if exists attendance_one_per_day;
drop index if exists public.attendance_date_idx;

alter table public.attendance add column session_id uuid
  references public.class_sessions (id) on delete cascade;

alter table public.attendance drop column class_date;

alter table public.attendance alter column session_id set not null;

alter table public.attendance
  add constraint attendance_one_per_session unique (enrollment_id, session_id);

create index attendance_session_idx on public.attendance (session_id);

-- Both parents must agree on the class, exactly as student_grades already
-- requires. Without it an enrolment in one course can carry attendance for a
-- session of another, and the grading view counts every row against the
-- enrolment — so a crossed row silently distorts somebody's attendance mark.
-- The application checks this too; this is the layer that cannot be forgotten.
alter table public.class_sessions
  add constraint class_sessions_id_class_unique unique (id, class_id);

alter table public.attendance add column class_id uuid;

-- No rows to backfill; the table was emptied before any of this.
update public.attendance a
   set class_id = (select cs.class_id from public.class_sessions cs where cs.id = a.session_id);

alter table public.attendance alter column class_id set not null;

alter table public.attendance drop constraint if exists attendance_enrollment_id_fkey;
alter table public.attendance drop constraint if exists attendance_session_id_fkey;

alter table public.attendance
  add constraint attendance_enrollment_fk
  foreign key (enrollment_id, class_id)
  references public.enrollments (id, class_id) on delete cascade;

alter table public.attendance
  add constraint attendance_session_fk
  foreign key (session_id, class_id)
  references public.class_sessions (id, class_id) on delete cascade;


-- ---------------------------------------------------------------------------
-- Generating a term
-- ---------------------------------------------------------------------------
-- Eight rows typed by hand is eight chances to get a date wrong, and the
-- sheikh will not do it. "Mondays from 17 October, eight times" is how a class
-- is actually described.
create or replace function public.generate_sessions(
  p_class_id   uuid,
  p_first      date,
  p_count      integer,
  p_every_days integer default 7
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing integer;
begin
  if p_count is null or p_count < 1 or p_count > 52 then
    raise exception 'A term must have between 1 and 52 sessions'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_every_days is null or p_every_days < 1 or p_every_days > 60 then
    raise exception 'Sessions must be between 1 and 60 days apart'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Refuse rather than append. Pressing the button twice should not silently
  -- produce sixteen meetings.
  select count(*) into v_existing from public.class_sessions where class_id = p_class_id;
  if v_existing > 0 then
    raise exception 'This class already has % session(s). Remove them first.', v_existing
      using errcode = 'unique_violation';
  end if;

  insert into public.class_sessions (class_id, session_number, meets_on)
  select p_class_id, n, p_first + ((n - 1) * p_every_days)
    from generate_series(1, p_count) as n;

  return p_count;
end;
$$;

comment on function public.generate_sessions is
  'Creates a term''s meetings at a fixed interval. Refuses if any exist, so '
  'pressing the button twice cannot double the term.';

grant execute on function public.generate_sessions(uuid, date, integer, integer)
  to authenticated;


-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.class_sessions enable row level security;

grant select, insert, update, delete on public.class_sessions to authenticated;

-- Deliberately nothing for anon. A session list is for the people on the
-- course and the people teaching it. Granting anon SELECT would let the query
-- reach the policies below, where the enrolled-student check reads
-- `enrollments` — which anon cannot — and an anonymous visitor would get an
-- error instead of a clean refusal.

create policy class_sessions_admin_all on public.class_sessions
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

create policy class_sessions_manage_own_class on public.class_sessions
  for all to authenticated
  using (app.teaches_class(class_id))
  with check (app.teaches_class(class_id));

-- A student sees the meetings of a class they are on, and only the published
-- ones — an unpublished session is a draft, including its recording.
create policy class_sessions_read_enrolled on public.class_sessions
  for select to authenticated
  using (
    is_published
    and exists (
      select 1
        from public.enrollments e
       where e.class_id = class_sessions.class_id
         and e.student_id = app.current_student_id()
         and e.status <> 'dropped'
    )
  );


-- ---------------------------------------------------------------------------
-- Attendance scoring, now that sessions exist
-- ---------------------------------------------------------------------------
-- Two changes from 20260923120100: the grace tiebreak reads the session's date
-- rather than a column that no longer exists, and a cancelled session is
-- excluded outright. Without that second part a class called off for Eid would
-- count as a missed meeting for everybody who was not marked present at it.
create or replace view public.enrollment_category_scores as
  select
    e.id        as enrollment_id,
    e.class_id,
    gc.id       as grade_category_id,
    gc.name,
    gc.weight,
    gc.position,
    gc.source,
    sum(sg.score)    as earned,
    sum(a.max_score) as possible
  from public.enrollments      e
  join public.grade_categories gc on gc.class_id = e.class_id and gc.source = 'assignments'
  join public.assignments      a  on a.grade_category_id = gc.id
  join public.student_grades   sg on sg.enrollment_id = e.id and sg.assignment_id = a.id
  where sg.score is not null
  group by e.id, e.class_id, gc.id, gc.name, gc.weight, gc.position, gc.source

  union all

  select
    r.enrollment_id,
    r.class_id,
    r.grade_category_id,
    r.name,
    r.weight,
    r.position,
    r.source,
    sum(r.credit) as earned,
    count(*)      as possible
  from (
    select
      e.id  as enrollment_id,
      e.class_id,
      gc.id as grade_category_id,
      gc.name,
      gc.weight,
      gc.position,
      gc.source,
      case att.status when 'present' then 1 when 'late' then 0.5 else 0 end as credit,
      case
        when att.status = 'present' then null
        else row_number() over (
               partition by e.id, gc.id
               order by
                 -- Penalties first, so presents never take up a rank that a
                 -- freebie was meant for.
                 case when att.status = 'present' then 1 else 0 end,
                 -- Then worst first: an absence costs more than a late.
                 case att.status when 'absent' then 0 else 1 end,
                 cs.meets_on
             )
      end as penalty_rank,
      cl.attendance_grace
    from public.enrollments      e
    join public.classes          cl  on cl.id = e.class_id
    join public.grade_categories gc  on gc.class_id = e.class_id and gc.source = 'attendance'
    join public.attendance       att on att.enrollment_id = e.id
    join public.class_sessions   cs  on cs.id = att.session_id
    where att.status <> 'excused'
      and not cs.is_cancelled
  ) r
  where r.penalty_rank is null
     or r.penalty_rank > r.attendance_grace
  group by r.enrollment_id, r.class_id, r.grade_category_id,
           r.name, r.weight, r.position, r.source;

alter view public.enrollment_category_scores set (security_invoker = on);
grant select on public.enrollment_category_scores to authenticated;


-- Unchanged from the original schema; recreated only because dropping
-- enrollment_category_scores took it with it.
create or replace view public.enrollment_grades as
  select
    enrollment_id,
    class_id,
    round(
      100::numeric * sum(weight * earned / nullif(possible, 0::numeric))
      / nullif(sum(weight) filter (where possible > 0::numeric), 0::numeric),
      2
    ) as current_score,
    coalesce(sum(weight) filter (where possible > 0::numeric), 0::numeric)
      as weight_graded_so_far
  from public.enrollment_category_scores cs
  group by enrollment_id, class_id;

alter view public.enrollment_grades set (security_invoker = on);
grant select on public.enrollment_grades to authenticated;
