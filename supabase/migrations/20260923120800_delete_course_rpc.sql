-- ============================================================================
-- Tarbiyah Institute — delete a course created by mistake
-- ============================================================================
-- Cancelling leaves a course sitting in the list forever, which is right for
-- one that ran and was called off, and wrong for a typo someone wants gone.
--
-- Deleting is only safe while nobody has ever enrolled. enrollments cascade
-- from classes, and student_grades, attendance and certificates cascade from
-- enrollments — so deleting a course with a roster would silently destroy
-- everyone's marks and their certificates. This refuses instead; a course that
-- has run gets cancelled, not deleted.
-- ============================================================================

create or replace function public.delete_course(p_course_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_enrolled integer;
begin
  select count(*)
    into v_enrolled
    from public.enrollments e
    join public.classes cl on cl.id = e.class_id
   where cl.course_id = p_course_id;

  if v_enrolled > 0 then
    raise exception
      'This course has % enrolled — cancel it instead of deleting, so their records survive.',
      v_enrolled
      using errcode = 'restrict_violation';
  end if;

  -- classes.course_id is ON DELETE RESTRICT, so the runs go first.
  delete from public.classes where course_id = p_course_id;
  delete from public.courses where id = p_course_id;
end;
$$;

grant execute on function public.delete_course(uuid) to authenticated;

comment on function public.delete_course is
  'Removes a course and its run. Refuses once anybody has enrolled, because '
  'marks, attendance and certificates would cascade away with it.';
