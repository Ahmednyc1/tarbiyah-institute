-- ============================================================================
-- Tarbiyah Institute — grace was ranking presents alongside penalties
-- ============================================================================
-- 20260923120000 ranked every non-excused session together and only nulled the
-- rank for presents afterwards — by which point the presents had already
-- consumed the low numbers. A student with four presents and one late had that
-- late sitting at rank 3, so a grace of 1 forgave nothing.
--
-- Penalties must be ordered ahead of presents *before* ranking, so the worst
-- penalty is always rank 1 and a grace of N forgives exactly N of them.
-- ============================================================================

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
                 att.class_date
             )
      end as penalty_rank,
      cl.attendance_grace
    from public.enrollments      e
    join public.classes          cl  on cl.id = e.class_id
    join public.grade_categories gc  on gc.class_id = e.class_id and gc.source = 'attendance'
    join public.attendance       att on att.enrollment_id = e.id
    where att.status <> 'excused'
  ) r
  where r.penalty_rank is null
     or r.penalty_rank > r.attendance_grace
  group by r.enrollment_id, r.class_id, r.grade_category_id,
           r.name, r.weight, r.position, r.source;

alter view public.enrollment_category_scores set (security_invoker = on);
grant select on public.enrollment_category_scores to authenticated;
