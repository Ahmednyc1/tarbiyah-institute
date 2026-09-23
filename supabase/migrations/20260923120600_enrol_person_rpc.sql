-- ============================================================================
-- Tarbiyah Institute — enrol somebody in one round trip, in one transaction
-- ============================================================================
-- Enrolling from the roster took five sequential requests: create the person,
-- look for a students row, create it, read the class fee, insert the
-- enrollment. Slow from a desk, and worse — not atomic. If the enrollment
-- failed (a full class, say) the person and student rows were already
-- committed, leaving an orphan behind from a registration that never happened.
--
-- SECURITY INVOKER: this must run as the caller so the admin-only policies on
-- people, students and enrollments still apply. Making it DEFINER would let any
-- signed-in user enrol anyone in anything.
-- ============================================================================

create or replace function public.enrol_person(
  p_class_id   uuid,
  p_person_id  uuid    default null,
  p_first_name text    default null,
  p_last_name  text    default null,
  p_email      text    default null,
  p_phone      text    default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_person  uuid := p_person_id;
  v_student uuid;
  v_fee     numeric;
  v_enroll  uuid;
begin
  if v_person is null then
    if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
      raise exception 'A first and last name are required'
        using errcode = 'invalid_parameter_value';
    end if;

    insert into public.people (first_name, last_name, email, phone)
    values (trim(p_first_name), trim(p_last_name),
            nullif(trim(p_email), ''), nullif(trim(p_phone), ''))
    returning id into v_person;
  end if;

  -- Everyone has a people row; the students row appears the first time they
  -- enrol, and is reused for every class after that.
  select id into v_student from public.students where person_id = v_person;
  if v_student is null then
    insert into public.students (person_id) values (v_person) returning id into v_student;
  end if;

  -- The fee is copied onto the enrollment rather than read through a join:
  -- raising a class fee later must not rewrite what past students owed.
  select registration_fee into v_fee from public.classes where id = p_class_id;
  if v_fee is null then
    raise exception 'No such class' using errcode = 'invalid_parameter_value';
  end if;

  -- The capacity trigger fires here and aborts the whole transaction if the
  -- class is full, taking the new person and student rows with it.
  insert into public.enrollments (class_id, student_id, amount_due)
  values (p_class_id, v_student, v_fee)
  returning id into v_enroll;

  return v_enroll;
end;
$$;

grant execute on function public.enrol_person(uuid, uuid, text, text, text, text) to authenticated;

comment on function public.enrol_person is
  'Creates the person and student records as needed and enrols them, in one '
  'transaction. A failed enrolment leaves nothing behind.';
