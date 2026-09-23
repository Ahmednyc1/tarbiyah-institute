-- ============================================================================
-- Tarbiyah Institute — a class cannot be oversold
-- ============================================================================
-- classes.capacity has been decorative since the schema was written. Nothing
-- stopped a 41st enrollment in a 40-seat class, and class_availability could
-- report "full" while the insert that made it full went through anyway.
--
-- This is also the seat lock that self-serve registration will need. Taking
-- FOR UPDATE on the class row serialises concurrent enrollments for that class,
-- so two people cannot both pass the count check for the last seat. Locking the
-- class rather than the enrollments table keeps the contention per-class: two
-- different courses filling at once do not block each other.
--
-- A NULL capacity means unlimited. Dropped enrollments release their seat,
-- matching class_availability.
-- ============================================================================

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
  -- Re-entering a class you dropped is the only UPDATE that consumes a seat.
  if tg_op = 'UPDATE'
     and new.status = old.status then
    return new;
  end if;

  if new.status = 'dropped' then
    return new;                      -- releasing a seat never needs checking
  end if;

  select capacity into v_capacity
    from public.classes
   where id = new.class_id
     for update;                     -- the lock: serialises rivals for a seat

  if v_capacity is null then
    return new;                      -- uncapped
  end if;

  select count(*) into v_taken
    from public.enrollments
   where class_id = new.class_id
     and status <> 'dropped'
     and id is distinct from new.id; -- do not count the row being updated

  if v_taken >= v_capacity then
    raise exception 'This class is full — all % seats are taken.', v_capacity
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enrollments_within_capacity on public.enrollments;
create trigger enrollments_within_capacity
  before insert or update of status on public.enrollments
  for each row execute function app.check_class_capacity();

comment on function app.check_class_capacity is
  'Refuses an enrollment past classes.capacity. Locks the class row so two '
  'simultaneous registrations cannot both claim the last seat.';
