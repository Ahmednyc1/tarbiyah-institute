-- ============================================================================
-- Tarbiyah Institute — a person record may only be claimed by a VERIFIED email
-- ============================================================================
-- SECURITY FIX. handle_new_auth_user bound any unclaimed public.people row to a
-- brand-new auth user whose email matched. The comment claimed "the address
-- comes from a provider that verified it". Nothing checked that.
--
-- The trigger is AFTER INSERT ON auth.users, so it ran the instant GoTrue
-- created the row — before any confirmation. Email/password signup is enabled
-- on this project (the app hides it, but /auth/v1/signup is a public endpoint),
-- so an anonymous request of the form
--
--   POST /auth/v1/signup {"email":"<an admin's address>","password":"..."}
--
-- was enough to attach the institute's admin and teacher record to an account
-- the attacker controlled, and to lock the real person out of ever claiming it.
--
-- THE FIX: claim only when email_confirmed_at is set. That is true at insert for
-- an OAuth provider, which has verified the address, and false for a password
-- signup until the person proves they hold the mailbox. A second trigger claims
-- at the moment of confirmation, so the password path still works if it is ever
-- re-enabled.
--
-- Deliberately NOT gated on raw_user_meta_data — that is supplied by the client
-- at signup and an attacker can set anything in it, including "email_verified".
-- email_confirmed_at is written by GoTrue and cannot be forged from outside.
-- ============================================================================

create or replace function app.claim_person_for_auth_user(
  p_auth_user uuid,
  p_email     text,
  p_first     text,
  p_last      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed uuid;
begin
  if p_email is null then
    return null;
  end if;

  update public.people p
     set auth_user_id = p_auth_user,
         first_name   = case when p.first_name = 'Pending' then p_first else p.first_name end,
         last_name    = case when p.last_name  = 'Pending' then p_last  else p.last_name  end
   where p.id = (
           select id
             from public.people
            where lower(email) = lower(p_email)
              and auth_user_id is null
            order by created_at
            limit 1
         )
  returning p.id into v_claimed;

  return v_claimed;
end;
$$;

comment on function app.claim_person_for_auth_user is
  'Attaches a login to a person record already on file. Callers MUST establish '
  'that the address is verified first — this function does not, and cannot.';


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
    nullif(trim(v_meta ->> 'first_name'),  ''),
    nullif(trim(v_meta ->> 'given_name'),  ''),
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

  -- Only a confirmed address may take over an existing record. An unconfirmed
  -- signup gets a fresh row of its own and touches nobody else's.
  if new.email_confirmed_at is not null then
    v_claimed := app.claim_person_for_auth_user(new.id, new.email, v_first, v_last);
    if v_claimed is not null then
      return new;
    end if;
  end if;

  insert into public.people (auth_user_id, first_name, last_name, email, sex)
  values (
    new.id,
    v_first,
    v_last,
    -- An unconfirmed signup must not take the email either: people_email_unique
    -- would otherwise let somebody squat an address they do not own, and block
    -- the real owner's record from ever being created or claimed.
    case
      when new.email_confirmed_at is null then null
      when exists (select 1 from public.people where lower(email) = lower(new.email)) then null
      else new.email
    end,
    nullif(trim(v_meta ->> 'sex'), '')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;


-- A password signup that later confirms claims its record at that moment.
create or replace function app.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person  uuid;
  v_claimed uuid;
begin
  select id into v_person from public.people where auth_user_id = new.id;

  -- Already attached to a record of its own: adopt the now-verified address if
  -- nobody else holds it, but never reassign somebody else's row.
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

  v_claimed := app.claim_person_for_auth_user(new.id, new.email, 'Pending', 'Pending');

  if v_claimed is null then
    insert into public.people (auth_user_id, first_name, last_name, email)
    values (new.id, 'Pending', 'Pending', new.email)
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function app.handle_auth_user_confirmed();

comment on function app.handle_auth_user_confirmed is
  'Claims a person record once a password signup proves it holds the mailbox. '
  'OAuth arrives already confirmed and is handled at insert.';
