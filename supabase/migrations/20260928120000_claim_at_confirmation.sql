-- ============================================================================
-- Tarbiyah Institute — create the person record at confirmation, not at signup
-- ============================================================================
-- Two problems, one cause.
--
-- 1. THE CLAIM NEVER RAN FOR GOOGLE. 20260924120400 assumed "OAuth arrives
--    already confirmed and is handled at insert". It does not. GoTrue inserts
--    the auth user with email_confirmed_at NULL and confirms it a moment later,
--    so handle_new_auth_user saw an unconfirmed row, skipped the claim, and
--    created a second person. handle_auth_user_confirmed then found a row
--    already attached to that login and only tried to adopt the address —
--    which failed, because the real student record still held it.
--
--    The result in production: a student enrolled on a roster signed in with
--    Google and was told "You are not enrolled in any courses yet", while their
--    enrolment sat on a person record nothing was attached to.
--
-- 2. ANYONE COULD FILL public.people WITH JUNK. /auth/v1/signup is a public
--    endpoint. Every unconfirmed signup minted a "Pending Pending" row with no
--    address. Harmless individually, unbounded in aggregate.
--
-- THE FIX: an unconfirmed auth user creates nothing at all. The person record
-- is claimed or created at the moment the address is confirmed, which is the
-- only moment we know the signup is real. That is now the ordinary path for
-- Google as well as for email, so one code path carries both.
--
-- Names were being lost on the confirmation path, which hardcoded 'Pending'.
-- They are now derived from the provider's metadata in both triggers, via one
-- shared function rather than two copies that could drift.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- The name derivation both triggers need
-- ---------------------------------------------------------------------------
create or replace function app.names_from_meta(
  p_meta      jsonb,
  out o_first text,
  out o_last  text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_full text := coalesce(
    nullif(trim(p_meta ->> 'full_name'), ''),
    nullif(trim(p_meta ->> 'name'), '')
  );
begin
  o_first := coalesce(
    nullif(trim(p_meta ->> 'first_name'), ''),
    nullif(trim(p_meta ->> 'given_name'), ''),
    nullif(split_part(coalesce(v_full, ''), ' ', 1), ''),
    'Pending'
  );

  o_last := coalesce(
    nullif(trim(p_meta ->> 'last_name'), ''),
    nullif(trim(p_meta ->> 'family_name'), ''),
    case
      when v_full is not null and position(' ' in v_full) > 0
      then nullif(trim(substring(v_full from position(' ' in v_full) + 1)), '')
    end,
    'Pending'
  );
end;
$$;

comment on function app.names_from_meta is
  'First and last name from an auth user''s metadata, falling back to Pending. '
  'Providers disagree about which keys they send; this is the one place that '
  'knows about all of them.';


-- ---------------------------------------------------------------------------
-- At insert: act only if the address is already confirmed
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first   text;
  v_last    text;
  v_claimed uuid;
begin
  -- An unconfirmed signup creates nothing. Anyone can POST to /auth/v1/signup
  -- with any address they like; until it is confirmed we know only that a
  -- stranger typed it. handle_auth_user_confirmed does the work instead.
  if new.email_confirmed_at is null then
    return new;
  end if;

  select o_first, o_last into v_first, v_last from app.names_from_meta(v_meta);

  v_claimed := app.claim_person_for_auth_user(new.id, new.email, v_first, v_last);
  if v_claimed is not null then
    return new;
  end if;

  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    v_first,
    v_last,
    -- Somebody else already holds this address on a record we could not claim
    -- (it has a login of its own). Leave ours blank rather than violate
    -- people_email_unique; an admin can merge the two by hand.
    case
      when exists (select 1 from public.people where lower(email) = lower(new.email))
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
  'Attaches a login that arrives already confirmed. Most do not — see '
  'handle_auth_user_confirmed, which carries Google and magic links both.';


-- ---------------------------------------------------------------------------
-- At confirmation: the ordinary path
-- ---------------------------------------------------------------------------
create or replace function app.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_first   text;
  v_last    text;
  v_person  uuid;
  v_claimed uuid;
begin
  select o_first, o_last into v_first, v_last from app.names_from_meta(v_meta);

  select id into v_person from public.people where auth_user_id = new.id;

  -- Already has a record of its own — only rows predating this migration, or
  -- a login confirmed twice. Adopt the now-verified address if it is free, and
  -- never reassign somebody else's row.
  if v_person is not null then
    update public.people
       set email = new.email
     where id = v_person
       and email is null
       and not exists (
         select 1 from public.people where lower(email) = lower(new.email)
       );
    return new;
  end if;

  v_claimed := app.claim_person_for_auth_user(new.id, new.email, v_first, v_last);
  if v_claimed is not null then
    return new;
  end if;

  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    v_first,
    v_last,
    case
      when exists (select 1 from public.people where lower(email) = lower(new.email))
      then null
      else new.email
    end,
    nullif(trim(v_meta ->> 'sex'), '')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

comment on function app.handle_auth_user_confirmed is
  'Claims or creates the person record once the address is proven. This is the '
  'ordinary path: Google, magic links and password signup all confirm after '
  'the auth row is inserted.';
