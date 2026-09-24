-- ============================================================================
-- Tarbiyah Institute — paying to rejoin a course you dropped
-- ============================================================================
-- redeem_hold always INSERTed an enrollment. enrollments_unique_student_per_class
-- is UNIQUE (class_id, student_id), so somebody who had dropped that course and
-- then paid to come back hit a duplicate key: Stripe took the money, the webhook
-- failed, and no enrollment existed. The money was gone and the seat was not.
--
-- hold_seat is right to let them reserve — a dropped person is not enrolled. It
-- is the redemption that has to cope with the row already being there.
--
-- ON AMOUNTS: the new payment is ADDED to whatever was recorded before, not
-- substituted. If an earlier payment was refunded outside the system, the row
-- reads as overpaid — visible, and an admin can correct it. Substituting would
-- silently erase a payment the masjid may still be holding. An anomaly you can
-- see beats one you cannot.
--
-- Grades and attendance from the earlier attempt are deliberately kept: they
-- hang off enrollment_id, which is the same row, and this is the same person in
-- the same class.
-- ============================================================================

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
  v_hold     record;
  v_student  uuid;
  v_fee      numeric;
  v_existing uuid;
  v_enroll   uuid;
begin
  select * into v_hold from public.seat_holds where id = p_hold_id for update;

  if v_hold is null then
    raise exception 'No such hold' using errcode = 'invalid_parameter_value';
  end if;

  if v_hold.enrollment_id is not null then
    return v_hold.enrollment_id;        -- already redeemed; Stripe retries
  end if;

  select id into v_student from public.students where person_id = v_hold.person_id;
  if v_student is null then
    insert into public.students (person_id) values (v_hold.person_id)
    returning id into v_student;
  end if;

  select registration_fee into v_fee from public.classes where id = v_hold.class_id;

  -- Released before the enrollment is written, in this same transaction: the
  -- capacity trigger counts holds as well as enrollments, so a live hold would
  -- have the seat counted twice and could reject the last one as full.
  update public.seat_holds
     set released_at = now(), release_reason = 'paid'
   where id = p_hold_id;

  select id into v_existing
    from public.enrollments
   where class_id = v_hold.class_id
     and student_id = v_student;

  if v_existing is null then
    insert into public.enrollments (class_id, student_id, amount_due, amount_paid)
    values (v_hold.class_id, v_student, coalesce(v_fee, 0), p_amount_paid)
    returning id into v_enroll;
  else
    update public.enrollments
       set status       = 'enrolled',
           amount_due   = coalesce(v_fee, amount_due),
           amount_paid  = amount_paid + p_amount_paid,
           completed_at = null
     where id = v_existing
    returning id into v_enroll;
  end if;

  update public.seat_holds set enrollment_id = v_enroll where id = p_hold_id;

  return v_enroll;
end;
$$;

revoke execute on function public.redeem_hold(uuid, numeric) from public, anon, authenticated;

comment on function public.redeem_hold is
  'Turns a paid hold into an enrollment, reactivating a dropped one rather than '
  'inserting a duplicate. Callable only with the service key.';
