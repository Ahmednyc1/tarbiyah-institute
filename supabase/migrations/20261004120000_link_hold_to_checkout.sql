-- ============================================================================
-- Tarbiyah Institute — tying a seat hold to the Stripe page that pays for it
-- ============================================================================
-- seat_holds has carried stripe_session_id since the table was created, and
-- nothing has ever been able to write it. `authenticated` holds table-level
-- UPDATE, but the only policies on the table are seat_holds_admin_all (admins)
-- and seat_holds_own (SELECT). An ordinary student updating their own hold
-- matches no policy, so the write is filtered to zero rows and reports
-- success — the silent refusal that RLS always gives.
--
-- It has to be written, for two reasons:
--
--   1. redeem_hold stores it as the payment's `reference`, which is what makes
--      payments_reference_unique able to stop the same Stripe session being
--      banked twice.
--   2. Reconciliation. When somebody says "I paid and I'm not on the list",
--      the answer is a Stripe session id sitting next to their hold.
--
-- SECURITY DEFINER, scoped to the caller's own live hold. A student may say
-- "this hold of mine is now this checkout session" and nothing else.
-- ============================================================================

create or replace function public.attach_checkout_session(
  p_hold_id    uuid,
  p_session_id text,
  p_status     text default 'open'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid := app.current_person_id();
begin
  if v_person is null then
    raise exception 'You must be signed in'
      using errcode = 'insufficient_privilege';
  end if;

  if p_session_id is null or p_session_id = '' then
    raise exception 'A checkout session id is required'
      using errcode = 'invalid_parameter_value';
  end if;

  update public.seat_holds
     set stripe_session_id = p_session_id,
         stripe_status     = p_status
   where id = p_hold_id
     and person_id = v_person
     and released_at is null;

  -- Loud rather than silent. A hold that cannot be linked means the webhook
  -- will later bank a payment with a null reference, losing the one thing that
  -- makes a repeat delivery detectable — the caller needs to know now.
  if not found then
    raise exception 'That hold is not yours, or it is no longer live'
      using errcode = 'insufficient_privilege';
  end if;
end;
$$;

comment on function public.attach_checkout_session is
  'Records which Stripe Checkout Session is paying for a hold. Scoped to the '
  'caller''s own live hold.';

grant execute on function public.attach_checkout_session(uuid, text, text) to authenticated;
