-- ============================================================================
-- Tarbiyah Institute — taking, releasing and redeeming a seat hold
-- ============================================================================
-- Three operations, each one transaction. The Stripe side of the flow calls
-- these; nothing here knows or cares that Stripe exists.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- hold_seat — claim a seat for the next 30 minutes
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER because it must count everyone's holds and enrollments to
-- know whether a seat is free, which the caller cannot read. The person_id is
-- resolved from the session rather than taken as an argument, so nobody can
-- reserve a seat in somebody else's name.

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
  v_taken    integer;
  v_hold     uuid;
begin
  if v_person is null then
    raise exception 'You must be signed in to register'
      using errcode = 'insufficient_privilege';
  end if;

  -- Stripe will not issue a checkout page for less than 30 minutes, and the
  -- hold must outlive that page. Shorter values are a bug, not a preference.
  if p_minutes < 30 then
    raise exception 'A hold must last at least 30 minutes, to outlive the payment page'
      using errcode = 'invalid_parameter_value';
  end if;

  select status, capacity into v_status, v_capacity
    from public.classes
   where id = p_class_id
     for update;                 -- the lock: rivals for the last seat queue here

  if v_status is null then
    raise exception 'No such class' using errcode = 'invalid_parameter_value';
  end if;
  if v_status <> 'open' then
    raise exception 'This course is not open for registration'
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

  -- Clear this person's own stale holds first, so an abandoned attempt does not
  -- block them from trying again.
  update public.seat_holds
     set released_at = now(), release_reason = 'expired'
   where class_id = p_class_id
     and person_id = v_person
     and released_at is null
     and expires_at <= now();

  -- A live hold of their own means they are already in checkout: hand back the
  -- same one rather than reserving a second seat.
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


-- ---------------------------------------------------------------------------
-- release_hold — give the seat back
-- ---------------------------------------------------------------------------
-- Called when Stripe reports the session expired, or when somebody cancels.
-- Idempotent: releasing an already-released hold changes nothing, which matters
-- because Stripe retries webhooks.

create or replace function public.release_hold(
  p_hold_id uuid,
  p_reason  text default 'cancelled'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_reason not in ('expired','cancelled','admin') then
    raise exception 'Unknown release reason %', p_reason
      using errcode = 'invalid_parameter_value';
  end if;

  update public.seat_holds
     set released_at = now(), release_reason = p_reason
   where id = p_hold_id
     and released_at is null;
end;
$$;

grant execute on function public.release_hold(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- redeem_hold — payment succeeded, make it real
-- ---------------------------------------------------------------------------
-- The hold is released BEFORE the enrollment is inserted, inside the same
-- transaction. The capacity trigger counts holds as well as enrollments, so
-- leaving it live would make the seat appear taken twice and could reject the
-- very last seat as full.
--
-- Idempotent by way of the hold: a hold that already produced an enrollment
-- returns that same enrollment. Stripe retries webhooks, and nobody should be
-- enrolled twice or charged for a seat they already hold.

create or replace function public.redeem_hold(
  p_hold_id     uuid,
  p_amount_paid numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hold    record;
  v_student uuid;
  v_fee     numeric;
  v_enroll  uuid;
begin
  select * into v_hold from public.seat_holds where id = p_hold_id for update;

  if v_hold is null then
    raise exception 'No such hold' using errcode = 'invalid_parameter_value';
  end if;

  -- Already redeemed: hand back what it became.
  if v_hold.enrollment_id is not null then
    return v_hold.enrollment_id;
  end if;

  -- Deliberately NOT refusing an expired hold. If Stripe took the money the
  -- seat is owed, whatever our clock says — the alternative is holding somebody
  -- else's payment with nothing to show for it.
  select id into v_student from public.students where person_id = v_hold.person_id;
  if v_student is null then
    insert into public.students (person_id) values (v_hold.person_id)
    returning id into v_student;
  end if;

  select registration_fee into v_fee from public.classes where id = v_hold.class_id;

  update public.seat_holds
     set released_at = now(), release_reason = 'paid'
   where id = p_hold_id;

  insert into public.enrollments (class_id, student_id, amount_due, amount_paid)
  values (v_hold.class_id, v_student, coalesce(v_fee, 0), p_amount_paid)
  returning id into v_enroll;

  update public.seat_holds set enrollment_id = v_enroll where id = p_hold_id;

  return v_enroll;
end;
$$;

-- Deliberately not granted to authenticated: only the webhook, running with a
-- privileged key, may turn a hold into an enrollment. A signed-in user calling
-- this would enrol themselves without paying.
revoke execute on function public.redeem_hold(uuid, numeric) from public, anon, authenticated;

comment on function public.redeem_hold is
  'Turns a paid hold into an enrollment. Callable only with the service key: '
  'granting it to authenticated would let anybody enrol without paying.';
