-- ============================================================================
-- Tarbiyah Institute — a class cannot be published without a grading scheme
-- ============================================================================
-- `classes_weights_valid_before_open` only guarded UPDATE, so a class could be
-- INSERTed straight into 'open' and take registrations and payment with no
-- grade_categories at all. Sciences of the Quran was created in exactly that
-- state by 20260922120100_real_catalogue.sql.
--
-- The rule, unchanged in spirit and now actually enforced:
--   draft / cancelled  -> no grading scheme required
--   anything else      -> grade category weights must total exactly 100
--
-- WHY A CONSTRAINT TRIGGER, NOT `BEFORE INSERT`:
-- grade_categories.class_id is a foreign key to classes, so no category can
-- exist until the class row does. A plain BEFORE INSERT check would therefore
-- always see a total of 0 and could never pass — it would silently mean
-- "classes may only be born as draft". DEFERRABLE INITIALLY DEFERRED runs the
-- check at COMMIT instead, so a single transaction may create a class AND its
-- categories together. Through PostgREST (one transaction per request) that
-- still means draft-then-publish, but an RPC can do it atomically.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Give the already-open class a scheme before the rule starts biting
-- ---------------------------------------------------------------------------
-- PLACEHOLDER WEIGHTS. These were not set by the instructor — they exist so the
-- class satisfies the new constraint. Replace them with the real breakdown.
-- Guarded by NOT EXISTS so a class that already has categories is left alone.

insert into public.grade_categories (class_id, name, weight, position)
select cl.id, v.name, v.weight, v.position
  from public.classes cl
  join public.courses co on co.id = cl.course_id
 cross join (values
   ('Attendance & Participation', 20, 0),
   ('Assignments',                30, 1),
   ('Midterm',                    20, 2),
   ('Final',                      30, 3)
 ) as v(name, weight, position)
 where co.code = 'QUR-101'
   and cl.status not in ('draft', 'cancelled')
   and not exists (
     select 1 from public.grade_categories g where g.class_id = cl.id
   );


-- ---------------------------------------------------------------------------
-- 2. One function, one rule, both entry points
-- ---------------------------------------------------------------------------

create or replace function app.check_class_weights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum numeric;
begin
  -- A class still being built, or called off, needs no grading scheme.
  if new.status in ('draft', 'cancelled') then
    return null;
  end if;

  select coalesce(sum(weight), 0) into v_sum
    from public.grade_categories
   where class_id = new.id;

  if v_sum <> 100 then
    raise exception
      'Class % cannot be "%": its grade category weights total %, not 100. '
      'Create the class as draft, add categories totalling 100, then publish it.',
      new.id, new.status, v_sum
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- Replace the UPDATE-only trigger so both paths share one definition.
drop trigger if exists classes_weights_valid_before_open on public.classes;
drop function if exists app.check_weights_on_status_change();

create constraint trigger classes_weights_valid
  after insert or update of status on public.classes
  deferrable initially deferred
  for each row execute function app.check_class_weights();

comment on function app.check_class_weights is
  'A class may only leave draft — or be created outside it — once its grade '
  'category weights total 100. Deferred, so a class and its categories can be '
  'created in one transaction.';
