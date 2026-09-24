-- ============================================================================
-- Tarbiyah Institute — reserve a seat while somebody pays for it
-- ============================================================================
-- Checkout takes minutes. During those minutes the seat must belong to the
-- person paying, and if they wander off it must come back on its own.
--
-- THIRTY MINUTES, and not a minute less. Stripe will not let a Checkout Session
-- live for under 30 minutes (expires_at accepts 30 minutes to 24 hours). If our
-- hold were shorter than Stripe's page, somebody could pay at minute 22 on a
-- page Stripe still honours, and find the seat already gone — money taken,
-- nothing given. The hold must always outlive the payment page.
--
-- TWO THINGS RELEASE A SEAT, deliberately:
--   1. Stripe's checkout.session.expired webhook, which is fast.
--   2. expires_at passing, which is certain.
-- Webhooks get missed — a deploy mid-delivery, a network blip, a bug in the
-- handler. If the only thing freeing a seat were an event that never arrived,
-- that seat would be locked forever and nobody would notice. The timestamp
-- makes it self-healing.
-- ============================================================================

create table if not exists public.seat_holds (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references public.classes (id) on delete cascade,
  person_id         uuid not null references public.people  (id) on delete cascade,

  expires_at        timestamptz not null,
  -- Set the moment a hold stops counting: converted, cancelled or expired.
  -- Kept rather than deleted so "I paid and I'm not on the list" is answerable.
  released_at       timestamptz,
  release_reason    text check (release_reason in ('paid','expired','cancelled','admin')),

  -- Stripe's own view of the session, mirrored for support and reconciliation.
  stripe_session_id text unique,
  stripe_status     text,
  enrollment_id     uuid references public.enrollments (id) on delete set null,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.seat_holds is
  'A seat reserved while somebody completes checkout. Counts against capacity '
  'until released or expired.';

create index seat_holds_class_idx on public.seat_holds (class_id);
create index seat_holds_live_idx  on public.seat_holds (class_id, expires_at)
  where released_at is null;

-- One live hold per person per class. Stale holds are released before a new one
-- is taken (see hold_seat), so an expired row never blocks a retry.
create unique index seat_holds_one_live_per_person
  on public.seat_holds (class_id, person_id)
  where released_at is null;

create trigger set_updated_at before update on public.seat_holds
  for each row execute function extensions.moddatetime(updated_at);


-- ---------------------------------------------------------------------------
-- What counts as taken
-- ---------------------------------------------------------------------------

create or replace function app.live_holds(p_class_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.seat_holds h
   where h.class_id = p_class_id
     and h.released_at is null
     and h.expires_at > now();
$$;

comment on function app.live_holds is
  'Seats reserved but not yet paid for. Expired holds stop counting on their '
  'own — no sweep is needed, and none should be relied on.';


-- ---------------------------------------------------------------------------
-- Capacity now counts holds as well as enrollments
-- ---------------------------------------------------------------------------

create or replace function app.check_class_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_taken    integer;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;

  if new.status = 'dropped' then
    return new;
  end if;

  select capacity into v_capacity
    from public.classes
   where id = new.class_id
     for update;                     -- serialises rivals for the last seat

  if v_capacity is null then
    return new;
  end if;

  select count(*) into v_taken
    from public.enrollments
   where class_id = new.class_id
     and status <> 'dropped'
     and id is distinct from new.id;

  -- A hold being converted must be released first, in the same transaction,
  -- or it would be counted alongside the enrollment it just became.
  v_taken := v_taken + app.live_holds(new.class_id);

  if v_taken >= v_capacity then
    raise exception 'This class is full — all % seats are taken.', v_capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;


-- ---------------------------------------------------------------------------
-- Availability, for the catalogue and the registration page
-- ---------------------------------------------------------------------------

create or replace view public.class_availability as
  select
    cl.id as class_id,
    cl.capacity,
    (
      (select count(*) from public.enrollments e
        where e.class_id = cl.id and e.status <> 'dropped')
      + app.live_holds(cl.id)
    )::int as taken,
    case
      when cl.capacity is null then null
      else greatest(0, cl.capacity - (
        (select count(*) from public.enrollments e
          where e.class_id = cl.id and e.status <> 'dropped')
        + app.live_holds(cl.id)
      ))::int
    end as remaining,
    case
      when cl.capacity is null then false
      else (
        (select count(*) from public.enrollments e
          where e.class_id = cl.id and e.status <> 'dropped')
        + app.live_holds(cl.id)
      ) >= cl.capacity
    end as is_full
  from public.classes cl;

alter view public.class_availability set (security_invoker = off);
grant select on public.class_availability to anon, authenticated;

comment on view public.class_availability is
  'SECURITY DEFINER on purpose. Publishes seat counts to anonymous visitors '
  'without exposing public.enrollments or public.seat_holds. Aggregates only, '
  'never row detail. Counts paid enrollments and live reservations alike.';


-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.seat_holds enable row level security;

grant select, insert, update on public.seat_holds to authenticated;

create policy seat_holds_admin_all on public.seat_holds
  for all to authenticated
  using (app.is_admin()) with check (app.is_admin());

-- A person may see and take their own reservations, and nobody else's.
create policy seat_holds_own on public.seat_holds
  for select to authenticated
  using (person_id = app.current_person_id());
