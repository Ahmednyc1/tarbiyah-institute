-- ============================================================================
-- Tarbiyah Institute — role visibility, and letting a login claim its person
-- ============================================================================
-- Two problems, one migration.
--
-- 1. The app cannot tell who is an admin. The `app` schema is deliberately
--    hidden from the Data API (see initial_schema.sql) and `public.admins` is
--    revoked from both API roles, so while RLS enforces admin access correctly
--    inside the database, the UI has no way to ask the question. Nothing
--    admin-facing can be built until it can.
--
-- 2. Every person an admin creates *before* that person signs in will be
--    duplicated the moment they do. handle_new_auth_user always INSERTs, so a
--    pre-existing people row (a teacher on a roster, a student typed in by
--    hand) is left orphaned while the new login gets a fresh, empty record.
--    Sh Mohammad Badawy is the first case: he teaches Sciences of the Quran
--    through person 1d4a…, which has no auth_user_id.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. public.my_roles — what the signed-in user is
-- ---------------------------------------------------------------------------
-- Re-exports the same four helpers RLS already uses, so there is no second
-- definition of "admin" that could drift from the first. One round trip
-- answers every question the UI has about the current user.
--
-- This view cannot leak: all four functions resolve from auth.uid(), so a
-- caller can only ever describe themselves. There are no parameters and no
-- rows belonging to anyone else.
--
-- security_invoker = off is required — the functions read tables the caller
-- cannot (admins, teachers, students).

create or replace view public.my_roles as
  select
    app.current_person_id()  as person_id,
    app.is_admin()           as is_admin,
    app.current_teacher_id() as teacher_id,
    app.current_student_id() as student_id;

alter view public.my_roles set (security_invoker = off);

grant select on public.my_roles to authenticated;

comment on view public.my_roles is
  'The caller''s own roles, for drawing the UI. Always one row. Never trust it '
  'for authorisation — RLS re-checks every query in the database.';


-- ---------------------------------------------------------------------------
-- 2. Let a new login claim the person record that is waiting for it
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_full    text  := coalesce(
                       nullif(trim(v_meta ->> 'full_name'), ''),
                       nullif(trim(v_meta ->> 'name'), '')
                     );
  v_first   text;
  v_last    text;
  v_claimed uuid;
begin
  v_first := coalesce(
    nullif(trim(v_meta ->> 'first_name'), ''),   -- our own forms
    nullif(trim(v_meta ->> 'given_name'), ''),   -- Google, Apple, Azure
    nullif(split_part(coalesce(v_full, ''), ' ', 1), ''),
    'Pending'
  );

  v_last := coalesce(
    nullif(trim(v_meta ->> 'last_name'),   ''),
    nullif(trim(v_meta ->> 'family_name'), ''),
    case
      when v_full is not null and position(' ' in v_full) > 0
      then nullif(trim(substring(v_full from position(' ' in v_full) + 1)), '')
    end,
    'Pending'
  );

  -- CLAIM: an existing person with this email and no login yet.
  --
  -- Safe because (a) it only ever touches rows where auth_user_id IS NULL, so
  -- an account that already belongs to someone can never be taken over, and
  -- (b) the address comes from a provider that verified it.
  --
  -- Names entered by an admin win over the provider's — they are more likely to
  -- be the spelling the institute uses. Only 'Pending' placeholders get filled.
  if new.email is not null then
    update public.people p
       set auth_user_id = new.id,
           first_name   = case when p.first_name = 'Pending' then v_first else p.first_name end,
           last_name    = case when p.last_name  = 'Pending' then v_last  else p.last_name  end
     where p.id = (
             select id
               from public.people
              where lower(email) = lower(new.email)
                and auth_user_id is null
              order by created_at
              limit 1
           )
    returning p.id into v_claimed;
  end if;

  if v_claimed is not null then
    return new;                       -- claimed; nothing to insert
  end if;

  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    v_first,
    v_last,
    -- people_email_unique is a partial unique index. If this address somehow
    -- already belongs to a claimed person, inserting it would raise and block
    -- the signup entirely — better to create the account without an email than
    -- to refuse the login.
    case
      when new.email is not null
       and exists (select 1 from public.people where lower(email) = lower(new.email))
      then null
      else new.email
    end,
    nullif(trim(v_meta ->> 'sex'), '')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

comment on function app.handle_new_auth_user is
  'Creates or claims the public.people row for a new auth user. Claims an '
  'unclaimed person with a matching verified email, so anyone entered by an '
  'admin before they sign up keeps their record instead of being duplicated.';


-- ---------------------------------------------------------------------------
-- 3. Sh Mohammad Badawy: email on file, and admin rights
-- ---------------------------------------------------------------------------
-- Without the email there is nothing for the claim above to match on, and he
-- would get a second person record the first time he signs in.

update public.people
   set email = 'M.badawy@masnewyork.org'
 where first_name = 'Mohammad'
   and last_name  = 'Badawy'
   and email is null;

insert into public.admins (person_id)
select p.id
  from public.people p
 where lower(p.email) = lower('M.badawy@masnewyork.org')
on conflict (person_id) do nothing;
