-- ============================================================================
-- Tarbiyah Institute — one row per payment
-- ============================================================================
-- enrollments.amount_paid records how much a student has paid. It does not
-- record *which payments* made up that figure, so nothing in this database
-- could ever be matched against a line in Stripe or a deposit on a bank
-- statement. The finance manager reconciles the two monthly and asked for
-- exactly that: every deposit itemised by source, with a reference she can
-- follow back.
--
-- So: a row per payment. Two $25 payments are two rows, not one row edited
-- twice — they landed on different days and probably in different payouts, and
-- collapsing them loses the very thing she needs.
--
-- amount_paid STAYS on the enrolment. Every screen reads it and nothing has to
-- change. But the application may no longer write it: the UPDATE privilege on
-- that one column is revoked below, and a trigger recalculates it from the
-- payments instead. It is a cache the database maintains, not a second version
-- of the truth that somebody has to remember to keep in step.
--
-- Refunds are negative amounts. The masjid's policy is that there are none,
-- but duplicate charges, card disputes and mistakes at the desk all happen,
-- and the alternative — deleting the row — is how books stop balancing.
-- ============================================================================

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,

  -- Negative is a refund or reversal. Zero is not a payment.
  amount        numeric(10,2) not null check (amount <> 0),

  method        text not null check (method in ('card','cash','transfer','other')),

  -- When the money moved, which is not always when it was typed in. The desk
  -- records Friday's cash on Sunday, and the report must say Friday.
  paid_at       timestamptz not null default now(),

  -- Stripe's payment_intent, or a cheque number, or whatever the desk can use
  -- to find it again. Unique where present: Stripe delivers a webhook at least
  -- once, sometimes more, and a retry must not bank the money twice.
  reference     text,

  note          text,

  -- Who took it. For cash at the desk this is the only accountability there is.
  recorded_by   uuid references public.people (id) on delete set null,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index payments_enrollment_idx on public.payments (enrollment_id);
create index payments_paid_at_idx    on public.payments (paid_at);

create unique index payments_reference_unique
  on public.payments (reference) where reference is not null;

create trigger set_updated_at before update on public.payments
  for each row execute function extensions.moddatetime(updated_at);

comment on table public.payments is
  'One row per payment or refund. The authoritative record of money received; '
  'enrollments.amount_paid is derived from it.';


-- ---------------------------------------------------------------------------
-- Keeping amount_paid in step
-- ---------------------------------------------------------------------------
create or replace function app.recalc_enrollment_paid(p_enrollment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total numeric(10,2);
begin
  if p_enrollment is null then
    return;
  end if;

  -- Lock the enrolment before totalling it. Without this, two payments landing
  -- together — a Stripe webhook and somebody at the desk — each compute their
  -- sum before the other commits, and the second write silently discards the
  -- first. Taking the row lock first makes the second transaction wait and then
  -- re-read, so it counts both. Same reason hold_seat locks the class.
  perform 1 from public.enrollments where id = p_enrollment for update;

  select coalesce(sum(amount), 0) into v_total
    from public.payments
   where enrollment_id = p_enrollment;

  -- enrollments.amount_paid is checked >= 0, and would fail here with a
  -- constraint name nobody can act on. Say what actually went wrong.
  if v_total < 0 then
    raise exception
      'Refunds for this enrolment come to % more than was ever paid', abs(v_total)
      using errcode = 'check_violation';
  end if;

  update public.enrollments
     set amount_paid = v_total
   where id = p_enrollment
     and amount_paid is distinct from v_total;
end;
$$;

create or replace function app.payments_sync_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.recalc_enrollment_paid(new.enrollment_id);
  elsif tg_op = 'DELETE' then
    perform app.recalc_enrollment_paid(old.enrollment_id);
  else
    perform app.recalc_enrollment_paid(old.enrollment_id);
    -- A payment moved to a different enrolment leaves two totals stale.
    if new.enrollment_id is distinct from old.enrollment_id then
      perform app.recalc_enrollment_paid(new.enrollment_id);
    end if;
  end if;

  return null;
end;
$$;

create trigger payments_sync_enrollment
  after insert or update or delete on public.payments
  for each row execute function app.payments_sync_enrollment();


-- ---------------------------------------------------------------------------
-- Everything already on file becomes an opening entry
-- ---------------------------------------------------------------------------
-- Without this the first recalculation of any enrolment would find no payments
-- and zero a balance that was really collected.
insert into public.payments (enrollment_id, amount, method, paid_at, note)
select id, amount_paid, 'other', enrolled_at,
       'Opening balance — recorded before individual payments were kept'
  from public.enrollments
 where amount_paid > 0;


-- ---------------------------------------------------------------------------
-- The application may no longer write amount_paid
-- ---------------------------------------------------------------------------
-- Convention would be enough until somebody forgot. This makes it impossible:
-- the recalculation runs as the function's owner and is unaffected.
--
-- It has to be done by revoking the table-wide privilege and granting the
-- columns back. A column-level REVOKE cannot carve a hole in a table-level
-- GRANT — the broad grant already covers every column and simply wins.
revoke update on public.enrollments from authenticated;

grant update (status, amount_due, payment_status, waiver_note,
              final_score, completed_at)
  on public.enrollments to authenticated;


-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.payments enable row level security;

grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.payments to service_role;

create policy payments_admin_all on public.payments
  for all to anon, authenticated
  using (app.is_admin()) with check (app.is_admin());

-- A student may see what they have paid, and nothing else. Teachers get
-- nothing: marking somebody's work is not a reason to see their finances.
create policy payments_read_own on public.payments
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.enrollments e
       where e.id = payments.enrollment_id
         and e.student_id = app.current_student_id()
    )
  );


-- ---------------------------------------------------------------------------
-- redeem_hold records the payment rather than adding to the total
-- ---------------------------------------------------------------------------
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

  update public.seat_holds
     set released_at = now(), release_reason = 'paid'
   where id = p_hold_id;

  select id into v_existing
    from public.enrollments
   where class_id = v_hold.class_id
     and student_id = v_student;

  if v_existing is null then
    insert into public.enrollments (class_id, student_id, amount_due)
    values (v_hold.class_id, v_student, coalesce(v_fee, 0))
    returning id into v_enroll;
  else
    update public.enrollments
       set status       = 'enrolled',
           amount_due   = coalesce(v_fee, amount_due),
           completed_at = null
     where id = v_existing
    returning id into v_enroll;
  end if;

  -- The payment, not the total. amount_paid follows from the trigger, so a
  -- returning student's earlier payments stay on the record beside this one.
  if p_amount_paid <> 0 then
    insert into public.payments (enrollment_id, amount, method, paid_at, reference, note)
    values (v_enroll, p_amount_paid, 'card', now(), v_hold.stripe_session_id,
            'Online registration')
    -- The predicate has to be repeated: payments_reference_unique is a PARTIAL
    -- index, and ON CONFLICT will not infer a partial index without it. Left
    -- off, this raises "no unique or exclusion constraint matching" on every
    -- call rather than on a conflict.
    on conflict (reference) where reference is not null do nothing;
  end if;

  update public.seat_holds set enrollment_id = v_enroll where id = p_hold_id;

  return v_enroll;
end;
$$;

revoke execute on function public.redeem_hold(uuid, numeric) from public, anon, authenticated;
grant execute on function public.redeem_hold(uuid, numeric) to service_role;

comment on function public.redeem_hold is
  'Turns a paid hold into an enrollment, reactivating a dropped one rather than '
  'inserting a duplicate, and records the payment against it. Callable only '
  'with the service key.';
