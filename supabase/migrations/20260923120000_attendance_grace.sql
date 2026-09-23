-- ============================================================================
-- Tarbiyah Institute — a per-class attendance grace allowance
-- ============================================================================
-- "You are allowed three absences before I start deducting." Until now the only
-- way to express that was to mark an absence `excused`, which overloaded that
-- status: a genuinely excused session and a spent freebie became
-- indistinguishable in the register.
--
-- Instead the register keeps recording what actually happened, and the grading
-- policy is applied on top of it.
--
-- TWO RULES, both deliberate:
--
--   1. Worst forgiven first — an absence before a late. Given one freebie a
--      student would rather spend it on a missed class than on arriving late,
--      and that is what "one absence allowed" is understood to mean. Ties break
--      chronologically.
--
--   2. A `present` is never forgiven. Grace only consumes sessions that carry a
--      penalty, so a class with two sessions and a grace of three cannot shrink
--      its own denominator to zero and vanish from the grade.
-- ============================================================================

alter table public.classes
  add column if not exists attendance_grace integer not null default 0
    check (attendance_grace >= 0);

comment on column public.classes.attendance_grace is
  'How many absences or lates are forgiven before attendance starts costing '
  'marks. 0 means every session counts. Per class, so a Ramadan intensive can '
  'be more lenient than a year-long course.';


-- ---------------------------------------------------------------------------
-- Rebuild the per-category view with grace applied to the attendance branch
-- ---------------------------------------------------------------------------

create or replace view public.enrollment_category_scores as
  -- Categories scored from marked assignments. Unmarked work (score IS NULL) is
  -- excluded, so this reads as "grade so far" rather than punishing a student
  -- for homework the teacher has not got to yet.
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

  -- Categories computed from the register, after grace.
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
      -- Rank only the sessions that cost something, worst first. A present gets
      -- no rank, so it can never be forgiven away.
      case
        when att.status = 'present' then null
        else row_number() over (
               partition by e.id, gc.id
               order by case att.status when 'absent' then 0 else 1 end, att.class_date
             )
      end as penalty_rank,
      cl.attendance_grace
    from public.enrollments      e
    join public.classes          cl  on cl.id = e.class_id
    join public.grade_categories gc  on gc.class_id = e.class_id and gc.source = 'attendance'
    join public.attendance       att on att.enrollment_id = e.id
    where att.status <> 'excused'     -- excused is removed outright, before grace
  ) r
  where r.penalty_rank is null                    -- keep every present
     or r.penalty_rank > r.attendance_grace       -- and everything past the allowance
  group by r.enrollment_id, r.class_id, r.grade_category_id,
           r.name, r.weight, r.position, r.source;

alter view public.enrollment_category_scores set (security_invoker = on);

comment on view public.enrollment_category_scores is
  'One row per enrollment per category that has something to score. Attendance '
  'categories have classes.attendance_grace applied: excused sessions are '
  'dropped first, then the worst N remaining penalties are forgiven. Respects '
  'the caller''s RLS, so a student sees only their own.';

grant select on public.enrollment_category_scores to authenticated;
