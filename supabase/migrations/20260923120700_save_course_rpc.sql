-- ============================================================================
-- Tarbiyah Institute — a course and its run, saved as one thing
-- ============================================================================
-- The schema splits the catalogue entry (courses) from a particular run of it
-- (classes) so a course taught twice keeps two separate rosters. The institute
-- does not work that way: if they teach Fiqh of Fasting again they will create
-- "Fiqh of Fasting 2" as a new course entirely.
--
-- So the split stays in the database — everything hangs off class_id and
-- unpicking it would touch every table — but it is no longer something anyone
-- has to see. One form writes both rows, in one transaction, so a course can
-- never exist without its details or the other way round.
--
-- SECURITY INVOKER: admin-only policies on courses and classes still apply.
-- ============================================================================

create or replace function public.save_course(
  p_code        text,
  p_title       text,
  p_term        text,
  p_teacher_id  uuid,
  p_course_id   uuid    default null,
  p_class_id    uuid    default null,
  p_description text    default null,
  p_is_active   boolean default true,
  p_fee         numeric default 0,
  p_capacity    integer default null,
  p_schedule    text    default null,
  p_location    text    default null,
  p_start       date    default null,
  p_end         date    default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_course uuid := p_course_id;
begin
  if coalesce(trim(p_code), '') = '' or coalesce(trim(p_title), '') = '' then
    raise exception 'A code and a title are required' using errcode = 'invalid_parameter_value';
  end if;
  if coalesce(trim(p_term), '') = '' then
    raise exception 'A term is required' using errcode = 'invalid_parameter_value';
  end if;

  if v_course is null then
    insert into public.courses (code, title, description, is_active)
    values (upper(trim(p_code)), trim(p_title), nullif(trim(p_description), ''), p_is_active)
    returning id into v_course;
  else
    update public.courses
       set code        = upper(trim(p_code)),
           title       = trim(p_title),
           description = nullif(trim(p_description), ''),
           is_active   = p_is_active
     where id = v_course;
  end if;

  if p_class_id is null then
    -- Always born a draft: classes_weights_valid refuses a published class with
    -- no grading scheme, and a scheme cannot exist before the class does.
    insert into public.classes (
      course_id, teacher_id, term, status, registration_fee,
      capacity, meeting_schedule, location, start_date, end_date
    )
    values (
      v_course, p_teacher_id, trim(p_term), 'draft', p_fee,
      p_capacity, nullif(trim(p_schedule), ''), nullif(trim(p_location), ''), p_start, p_end
    );
  else
    update public.classes
       set teacher_id       = p_teacher_id,
           term             = trim(p_term),
           registration_fee = p_fee,
           capacity         = p_capacity,
           meeting_schedule = nullif(trim(p_schedule), ''),
           location         = nullif(trim(p_location), ''),
           start_date       = p_start,
           end_date         = p_end
     where id = p_class_id
       and course_id = v_course;   -- never let a payload reach another course
  end if;

  return v_course;
end;
$$;

grant execute on function public.save_course(
  text, text, text, uuid, uuid, uuid, text, boolean, numeric, integer, text, text, date, date
) to authenticated;

comment on function public.save_course is
  'Creates or updates a course together with its single run, in one '
  'transaction. The courses/classes split is kept in the database but hidden '
  'from the interface: this institute treats a repeat as a new course.';
