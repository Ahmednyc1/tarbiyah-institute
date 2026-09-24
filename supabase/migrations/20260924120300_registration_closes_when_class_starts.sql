-- ============================================================================
-- Tarbiyah Institute — a course that has begun stops selling seats
-- ============================================================================
-- A course becomes 'in_progress' the moment its first session runs, and
-- hold_seat already refuses anything but 'open'. But nothing moves it: an admin
-- has to remember, on the morning of the first class. Forget, and the public
-- site keeps taking registrations into week three.
--
-- start_date is the fact; the status is somebody's recollection of it. This
-- trusts the fact. Same reasoning as the hold expiry — a rule that depends on a
-- person remembering is a rule that fails quietly.
--
-- A class with no start_date is unaffected, so nothing breaks for a course
-- whose dates are not settled yet.
-- ============================================================================

create or replace function public.hold_seat(
  p_class_id uuid,
  p_minutes  integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person   uuid := app.current_person_id();
  v_capacity integer;
  v_status   text;
  v_start    date;
  v_taken    integer;
  v_hold     uuid;
begin
  if v_person is null then
    raise exception 'You must be signed in to register'
      using errcode = 'insufficient_privilege';
  end if;

  if p_minutes < 30 then
    raise exception 'A hold must last at least 30 minutes, to outlive the payment page'
      using errcode = 'invalid_parameter_value';
  end if;

  select status, capacity, start_date
    into v_status, v_capacity, v_start
    from public.classes
   where id = p_class_id
     for update;

  if v_status is null then
    raise exception 'No such class' using errcode = 'invalid_parameter_value';
  end if;
  if v_status <> 'open' then
    raise exception 'This course is not open for registration'
      using errcode = 'check_violation';
  end if;

  -- The course has begun, whatever the status still says. Joining late is a
  -- judgement for the institute, made on the roster, not a checkout page.
  if v_start is not null and v_start <= current_date then
    raise exception 'This course has already begun — please contact the institute to join'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1
      from public.enrollments e
      join public.students s on s.id = e.student_id
     where e.class_id = p_class_id
       and s.person_id = v_person
       and e.status <> 'dropped'
  ) then
    raise exception 'You are already enrolled in this course'
      using errcode = 'unique_violation';
  end if;

  -- Somebody who paid and later dropped is not sent back through checkout:
  -- whether they owe again is a policy question about money, and a person
  -- decides it, not this function.
  if exists (
    select 1
      from public.enrollments e
      join public.students s on s.id = e.student_id
     where e.class_id = p_class_id
       and s.person_id = v_person
       and e.status = 'dropped'
       and e.amount_paid > 0
  ) then
    raise exception 'You were previously registered for this course — please contact the institute to rejoin'
      using errcode = 'check_violation';
  end if;

  update public.seat_holds
     set released_at = now(), release_reason = 'expired'
   where class_id = p_class_id
     and person_id = v_person
     and released_at is null
     and expires_at <= now();

  select id into v_hold
    from public.seat_holds
   where class_id = p_class_id
     and person_id = v_person
     and released_at is null
     and expires_at > now();
  if v_hold is not null then
    return v_hold;
  end if;

  if v_capacity is not null then
    select count(*) into v_taken
      from public.enrollments
     where class_id = p_class_id and status <> 'dropped';

    v_taken := v_taken + app.live_holds(p_class_id);

    if v_taken >= v_capacity then
      raise exception 'This course is full — all % seats are taken.', v_capacity
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.seat_holds (class_id, person_id, expires_at)
  values (p_class_id, v_person, now() + make_interval(mins => p_minutes))
  returning id into v_hold;

  return v_hold;
end;
$$;

grant execute on function public.hold_seat(uuid, integer) to authenticated;
