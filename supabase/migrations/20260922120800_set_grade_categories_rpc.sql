-- ============================================================================
-- Tarbiyah Institute — save a whole grading scheme atomically
-- ============================================================================
-- grade_categories_weights_sum_to_100 is DEFERRABLE INITIALLY DEFERRED, so it
-- runs at COMMIT. PostgREST gives every request its own transaction, which
-- means a scheme cannot be edited one row at a time on a published class:
--
--   Homework 30 -> 25   commits a total of 95   -> rejected
--
-- The editor therefore submits the entire scheme and this reconciles it —
-- delete, update, insert — inside one transaction, so the total is only ever
-- checked once, at the end.
--
-- SECURITY INVOKER on purpose: this must run with the caller's own rights, so
-- grade_categories_manage_own_class still confines a teacher to their classes.
-- Making it DEFINER would hand any signed-in user the whole institute.
-- ============================================================================

create or replace function public.set_grade_categories(
  p_class_id   uuid,
  p_categories jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_keep uuid[];
begin
  if jsonb_typeof(p_categories) <> 'array' then
    raise exception 'p_categories must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;

  -- Ids present in the payload survive; everything else for this class goes.
  select coalesce(array_agg((c ->> 'id')::uuid), '{}')
    into v_keep
    from jsonb_array_elements(p_categories) c
   where nullif(c ->> 'id', '') is not null;

  -- Deleting a category cascades to its assignments and their marks, via
  -- assignments_category_same_class_fk. The UI warns before calling this.
  delete from public.grade_categories
   where class_id = p_class_id
     and not (id = any(v_keep));

  update public.grade_categories g
     set name     = c.name,
         weight   = c.weight,
         position = c.position,
         source   = c.source
    from (
      select (x ->> 'id')::uuid              as id,
             trim(x ->> 'name')              as name,
             (x ->> 'weight')::numeric       as weight,
             coalesce((x ->> 'position')::int, 0) as position,
             coalesce(nullif(x ->> 'source', ''), 'assignments') as source
        from jsonb_array_elements(p_categories) x
       where nullif(x ->> 'id', '') is not null
    ) c
   where g.id = c.id
     and g.class_id = p_class_id;   -- never let a payload reach another class

  insert into public.grade_categories (class_id, name, weight, position, source)
  select p_class_id,
         trim(x ->> 'name'),
         (x ->> 'weight')::numeric,
         coalesce((x ->> 'position')::int, 0),
         coalesce(nullif(x ->> 'source', ''), 'assignments')
    from jsonb_array_elements(p_categories) x
   where nullif(x ->> 'id', '') is null;
end;
$$;

grant execute on function public.set_grade_categories(uuid, jsonb) to authenticated;

comment on function public.set_grade_categories is
  'Replaces a class''s grading scheme in one transaction, so the '
  'weights-sum-to-100 check is evaluated once at commit rather than after each '
  'individual edit. Runs as the caller: RLS still applies.';
