-- ============================================================================
-- Tarbiyah Institute — make new-user handling work for OAuth
-- ============================================================================
-- Google (and every other OAuth provider) does not send `first_name`,
-- `last_name` or `sex`. It sends `given_name`, `family_name`, `name`, `email`.
-- The original trigger read only the password-signup keys, so every Google user
-- would have been created as "Pending Pending", sex 'male'.
--
-- The names are recoverable from what Google does send. `sex` is not — Google
-- has no such field — and defaulting it silently recorded every woman who
-- signed in with Google as male. Since no class is gender-restricted, the
-- column is no longer required at all.
--
-- `classes.gender_restriction` is deliberately left in place, defaulting to
-- 'mixed'. It costs nothing and is there if a class ever needs it.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. sex becomes optional
-- ---------------------------------------------------------------------------
-- The existing CHECK (sex in ('male','female')) still holds: a NULL passes a
-- CHECK constraint, so no value can be wrong — only absent.

alter table public.people alter column sex drop not null;

comment on column public.people.sex is
  'Optional. No class is gender-restricted, so this is not collected at signup. '
  'OAuth providers do not supply it.';


-- ---------------------------------------------------------------------------
-- 2. Teach the signup trigger about OAuth metadata
-- ---------------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  -- Password signup sends full_name; Google sends name. Either may be absent.
  v_full  text  := coalesce(
                     nullif(trim(v_meta ->> 'full_name'), ''),
                     nullif(trim(v_meta ->> 'name'), '')
                   );
  v_first text;
  v_last  text;
begin
  v_first := coalesce(
    nullif(trim(v_meta ->> 'first_name'),  ''),   -- our own signup form
    nullif(trim(v_meta ->> 'given_name'),  ''),   -- Google, Apple, Azure
    nullif(split_part(coalesce(v_full, ''), ' ', 1), ''),
    'Pending'
  );

  v_last := coalesce(
    nullif(trim(v_meta ->> 'last_name'),   ''),
    nullif(trim(v_meta ->> 'family_name'), ''),
    -- Everything after the first space, but only if there is one — otherwise a
    -- single-word name would be copied into both columns.
    case
      when v_full is not null and position(' ' in v_full) > 0
      then nullif(trim(substring(v_full from position(' ' in v_full) + 1)), '')
    end,
    'Pending'
  );

  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    v_first,
    v_last,
    new.email,
    -- No longer defaulted. Absent is honest; 'male' was a guess.
    nullif(trim(v_meta ->> 'sex'), '')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

comment on function app.handle_new_auth_user is
  'Creates the public.people row for a new auth user. Handles both our password '
  'signup (first_name/last_name) and OAuth providers (given_name/family_name/name).';
