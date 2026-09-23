-- ============================================================================
-- Tarbiyah Institute — enrollment_grades returned a ratio, not a percentage
-- ============================================================================
-- The original formula (initial_schema.sql) computed
--
--     sum(weight * earned / possible) / sum(weight)
--
-- where earned/possible is a ratio in 0..1, so a student sitting at 80% came
-- back as 0.80. Every consumer of this number expects a percentage:
--
--   enrollments.final_score   check (final_score between 0 and 100)
--   certificates.final_score  check (final_score between 0 and 100)
--   classes.passing_score     default 60, check between 0 and 100
--
-- So a pass/fail comparison against passing_score would have failed every
-- student in the institute. It has never been caught because nothing read the
-- view until now.
-- ============================================================================

create or replace view public.enrollment_grades as
  select
    cs.enrollment_id,
    cs.class_id,
    round(
      100 * sum(cs.weight * cs.earned / nullif(cs.possible, 0))
          / nullif(sum(cs.weight) filter (where cs.possible > 0), 0)
    , 2) as current_score,
    coalesce(sum(cs.weight) filter (where cs.possible > 0), 0) as weight_graded_so_far
  from public.enrollment_category_scores cs
  group by cs.enrollment_id, cs.class_id;

alter view public.enrollment_grades set (security_invoker = on);

comment on view public.enrollment_grades is
  'Live weighted grade as a PERCENTAGE (0-100), comparable to '
  'classes.passing_score and enrollments.final_score. Categories with nothing '
  'scored yet are excluded from both numerator and divisor. NOTE: this respects '
  'the caller''s RLS and students may only read published assignments, so a '
  'student''s figure counts published work only.';

grant select on public.enrollment_grades to authenticated;
