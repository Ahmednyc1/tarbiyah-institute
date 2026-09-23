-- ============================================================================
-- Tarbiyah Institute — attendance can be a graded category
-- ============================================================================
-- grade_categories weight *assignments*, and the attendance table was wholly
-- unrelated to them. So a category like "Attendance & Participation 20%" — which
-- Sciences of the Quran already has — had no way to ever receive a value.
--
-- A category now declares where its score comes from. Assignment categories
-- behave exactly as before; attendance categories are computed from the
-- attendance register, so taking the register each week *is* the grading.
--
-- THE RULE:  present = 1 · late = 0.5 · absent = 0
--            excused is removed from the denominator, not counted as zero.
--
-- The teacher's override is the register itself: marking an absence excused
-- removes it from the calculation. There is no separate override table.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Where does a category's score come from?
-- ---------------------------------------------------------------------------

alter table public.grade_categories
  add column if not exists source text not null default 'assignments'
    check (source in ('assignments', 'attendance'));

comment on column public.grade_categories.source is
  '''assignments'' scores from student_grades; ''attendance'' is computed from '
  'the attendance register. Attendance categories should have no assignments.';

-- Sciences of the Quran's placeholder category is an attendance one.
update public.grade_categories g
   set source = 'attendance'
  from public.classes cl
  join public.courses co on co.id = cl.course_id
 where g.class_id = cl.id
   and co.code = 'QUR-101'
   and g.name = 'Attendance & Participation';


-- ---------------------------------------------------------------------------
-- 2. Per-category breakdown
-- ---------------------------------------------------------------------------
-- Split out so the student's class-detail page can show the breakdown directly
-- rather than recomputing it, and so enrollment_grades has one source of truth.

create or replace view public.enrollment_category_scores as
  -- Categories scored from marked assignments. Unmarked work (score IS NULL)
  -- is excluded, so this reads as "grade so far" rather than punishing a
  -- student for homework the teacher has not got to yet.
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

  -- Categories computed from the register.
  select
    e.id,
    e.class_id,
    gc.id,
    gc.name,
    gc.weight,
    gc.position,
    gc.source,
    sum(case att.status when 'present' then 1 when 'late' then 0.5 else 0 end) as earned,
    count(*)                                                                   as possible
  from public.enrollments      e
  join public.grade_categories gc  on gc.class_id = e.class_id and gc.source = 'attendance'
  join public.attendance       att on att.enrollment_id = e.id
  where att.status <> 'excused'        -- removed from the denominator entirely
  group by e.id, e.class_id, gc.id, gc.name, gc.weight, gc.position, gc.source;

alter view public.enrollment_category_scores set (security_invoker = on);

comment on view public.enrollment_category_scores is
  'One row per enrollment per category that has something to score. Respects '
  'the caller''s RLS, so a student sees only their own.';


-- ---------------------------------------------------------------------------
-- 3. The weighted total, now including attendance
-- ---------------------------------------------------------------------------
-- Same columns as before, so nothing downstream changes.
-- Categories with nothing scored yet are excluded from both the numerator and
-- the divisor — a class two weeks in reports the grade for the work that has
-- actually happened, not a percentage of the whole term.

create or replace view public.enrollment_grades as
  select
    cs.enrollment_id,
    cs.class_id,
    round(
      sum(cs.weight * cs.earned / nullif(cs.possible, 0))
        / nullif(sum(cs.weight) filter (where cs.possible > 0), 0)
    , 2) as current_score,
    coalesce(sum(cs.weight) filter (where cs.possible > 0), 0) as weight_graded_so_far
  from public.enrollment_category_scores cs
  group by cs.enrollment_id, cs.class_id;

alter view public.enrollment_grades set (security_invoker = on);

comment on view public.enrollment_grades is
  'Live weighted grade across all category types. Certificates store their own '
  'frozen final_score. NOTE: because this respects the caller''s RLS and '
  'students may only read published assignments, a student''s figure counts '
  'published work only — publishing an assignment is what makes it count.';

grant select on public.enrollment_category_scores to authenticated;
grant select on public.enrollment_grades          to authenticated;
