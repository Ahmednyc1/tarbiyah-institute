-- ============================================================================
-- Tarbiyah Institute — three fixes from the security review
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Signed-in students could not see who teaches anything
-- ---------------------------------------------------------------------------
-- 20260923121000 replaced the SECURITY DEFINER teacher_directory with column
-- grants and policies — but wrote both policies TO anon only. Signed-out
-- visitors kept seeing instructor names; the moment somebody signed in, every
-- instructor vanished from the catalogue, the registration page and the portal.
--
-- It went unnoticed because both people who tested it are admins, and
-- people_admin_all let them through.

alter policy people_read_active_teachers on public.people to anon, authenticated;
alter policy teachers_read_public        on public.teachers to anon, authenticated;


-- ---------------------------------------------------------------------------
-- 2. The Stripe webhook could not have redeemed anything
-- ---------------------------------------------------------------------------
-- redeem_hold was revoked from `public` to keep it away from signed-in users.
-- That also stripped service_role, which is not a member of postgres — so the
-- webhook, the one caller that is supposed to have it, would have failed with
-- "permission denied for function redeem_hold" the first time somebody paid.

grant execute on function public.redeem_hold(uuid, numeric) to service_role;


-- ---------------------------------------------------------------------------
-- 3. Anybody could release somebody else's seat
-- ---------------------------------------------------------------------------
-- release_hold is SECURITY DEFINER and granted to authenticated, and matched on
-- the caller-supplied hold id alone — no ownership test. Being DEFINER it also
-- bypassed the seat_holds_own policy that would otherwise have scoped it. A
-- signed-in student who learned another person's hold id could free their seat
-- while they were on the Stripe page.
--
-- Hold ids are not enumerable today, but hold_seat returns one to the browser
-- and the checkout flow will carry it through redirect URLs, Stripe metadata
-- and browser history. Cheaper to close now than to rely on it staying secret.
--
-- The webhook does not call this: running with the service key it bypasses RLS
-- and updates seat_holds directly, so this stays strictly the "I changed my
-- mind" path.

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
     and released_at is null
     and (person_id = app.current_person_id() or app.is_admin());
end;
$$;

grant execute on function public.release_hold(uuid, text) to authenticated;

comment on function public.release_hold is
  'Releases a seat the caller holds. Idempotent, and silently does nothing for '
  'a hold belonging to somebody else.';


-- ---------------------------------------------------------------------------
-- 4. A hold could be minted for an arbitrary length
-- ---------------------------------------------------------------------------
-- p_minutes had a floor and no ceiling, so a caller could reserve a seat for
-- years. Stripe's own ceiling for a Checkout Session is 24 hours; a hold longer
-- than the page it protects is meaningless.

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

  -- Stripe allows a Checkout Session of 30 minutes to 24 hours. The hold must
  -- outlive the page and there is no sense in it outliving it by weeks.
  if p_minutes < 30 or p_minutes > 1440 then
    raise exception 'A hold must last between 30 minutes and 24 hours'
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
  if v_start is not null and v_start <= current_date then
    raise exception 'This course has already begun — please contact the institute to join'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.enrollments e
      join public.students s on s.id = e.student_id
     where e.class_id = p_class_id and s.person_id = v_person and e.status <> 'dropped'
  ) then
    raise exception 'You are already enrolled in this course'
      using errcode = 'unique_violation';
  end if;

  if exists (
    select 1 from public.enrollments e
      join public.students s on s.id = e.student_id
     where e.class_id = p_class_id and s.person_id = v_person
       and e.status = 'dropped' and e.amount_paid > 0
  ) then
    raise exception 'You were previously registered for this course — please contact the institute to rejoin'
      using errcode = 'check_violation';
  end if;

  update public.seat_holds
     set released_at = now(), release_reason = 'expired'
   where class_id = p_class_id and person_id = v_person
     and released_at is null and expires_at <= now();

  select id into v_hold from public.seat_holds
   where class_id = p_class_id and person_id = v_person
     and released_at is null and expires_at > now();
  if v_hold is not null then
    return v_hold;
  end if;

  if v_capacity is not null then
    select count(*) into v_taken from public.enrollments
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
