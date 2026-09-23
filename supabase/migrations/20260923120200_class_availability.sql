-- ============================================================================
-- Tarbiyah Institute — how full is a class, without exposing who is in it
-- ============================================================================
-- The catalogue and the registration page need to say "12 of 40 seats taken"
-- and refuse a full class. But `enrollments` is granted to `authenticated`
-- only, and even then RLS narrows a student to their own row — so nobody
-- outside staff can count a roster.
--
-- This exposes the count and nothing else. No names, no ids, no payment state.
-- SECURITY DEFINER because it must read a table the caller cannot; the SELECT
-- list is the boundary.
--
-- Dropped enrollments free their seat. Everything else — enrolled, completed,
-- failed — still occupies one.
-- ============================================================================

create or replace view public.class_availability as
  select
    cl.id                                   as class_id,
    cl.capacity,
    count(e.id) filter (where e.status <> 'dropped')::int as taken,
    case
      when cl.capacity is null then null    -- no cap set means unlimited
      else greatest(0, cl.capacity - count(e.id) filter (where e.status <> 'dropped'))::int
    end                                     as remaining,
    case
      when cl.capacity is null then false
      else count(e.id) filter (where e.status <> 'dropped') >= cl.capacity
    end                                     as is_full
  from public.classes cl
  left join public.enrollments e on e.class_id = cl.id
  group by cl.id, cl.capacity;

alter view public.class_availability set (security_invoker = off);

grant select on public.class_availability to anon, authenticated;

comment on view public.class_availability is
  'Seat counts per class for the catalogue and registration page. Deliberately '
  'bypasses RLS on enrollments — keep it to aggregates, never row detail.';
