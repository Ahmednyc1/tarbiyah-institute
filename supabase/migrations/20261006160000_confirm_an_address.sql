-- ============================================================================
-- Tarbiyah Institute — proving an address somebody else typed
-- ============================================================================
-- A person who signs in with Google has already proved their address to
-- Google. A person enrolled at the desk has not proved it to anybody: an admin
-- typed it, and if they typed yusuf@gmial.com then every message the institute
-- ever sends that student goes to a stranger. Nothing in the system would say
-- so. The student simply never hears anything, and the first anyone knows is a
-- complaint weeks later.
--
-- WHY THE FIRST EMAIL MUST BE THIN, and why a second one follows it. Until the
-- address is proved, the recipient might be anybody. So the confirmation
-- message says only that somebody registered this address at the institute and
-- asks whether that is them — no course, no schedule, no money. Once they
-- click, the address is proved and the real welcome can be sent safely.
--
-- THE TOKEN IS STORED HASHED. A link in an inbox is a credential: it confirms
-- an identity on one click. Storing the raw value would mean a leaked database
-- row is a working link. Only the sha256 is kept, so the plaintext exists in
-- exactly two places — the email, and the moment the route checks it.
--
-- TWENTY-FOUR HOURS, and the email says so. Short enough that a stale link in
-- a stranger's inbox stops mattering quickly; short enough that people WILL
-- miss it, which is why the roster shows who has not confirmed and offers to
-- send another.
-- ============================================================================

alter table public.people
  add column email_confirmed_at timestamptz;

comment on column public.people.email_confirmed_at is
  'When this address was proved to reach this person. Set by clicking a '
  'confirmation link, or at sign-in for an address Google already verified. '
  'Null means unproved, not invalid.';

-- Anybody who has signed in has already proved their address to their identity
-- provider, so they are confirmed as of now rather than being asked again.
update public.people
   set email_confirmed_at = now()
 where auth_user_id is not null
   and email is not null;


create table public.email_confirmations (
  id           uuid primary key default gen_random_uuid(),
  person_id    uuid not null references public.people (id) on delete cascade,

  -- The address being proved, captured at issue time. If an admin corrects a
  -- typo afterwards, the outstanding link must not confirm the new address —
  -- it was sent somewhere else entirely.
  email        text not null,

  -- sha256 of the token that went in the email. Never the token itself.
  token_hash   text not null unique,

  expires_at   timestamptz not null,
  confirmed_at timestamptz,

  -- Which enrollment prompted it, so the welcome that follows knows what to
  -- say. Null if an address is ever confirmed outside an enrolment.
  enrollment_id uuid references public.enrollments (id) on delete set null,

  created_at   timestamptz not null default now()
);

comment on table public.email_confirmations is
  'Outstanding and spent "is this really you" links. One row per send, kept '
  'after use so "we did write to them" is answerable.';

create index email_confirmations_person_idx on public.email_confirmations (person_id, created_at desc);

-- At most one live link per person. A resend supersedes rather than
-- accumulates, so an older link in an inbox cannot still work.
create unique index email_confirmations_one_live
  on public.email_confirmations (person_id)
  where confirmed_at is null;


alter table public.email_confirmations enable row level security;

-- Nothing for anon and nothing for authenticated. These rows are checked by a
-- route handler holding the service key, and a signed-in user has no business
-- reading even their own: the token hash is the whole security of the thing.
grant select, insert, update on public.email_confirmations to service_role;

create policy email_confirmations_admin_read on public.email_confirmations
  for select to authenticated
  using (app.is_admin());
grant select on public.email_confirmations to authenticated;


-- ---------------------------------------------------------------------------
-- Issue a link
-- ---------------------------------------------------------------------------
-- The raw token never reaches the database. The caller generates it, hashes
-- it, sends the plaintext in the email and stores only the hash here.
create or replace function public.issue_email_confirmation(
  p_person_id     uuid,
  p_token_hash    text,
  p_enrollment_id uuid default null,
  p_hours         integer default 24
)
returns table (email text, first_name text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_first text;
  v_expires timestamptz;
begin
  if not app.is_admin() then
    raise exception 'Only an administrator may send a confirmation'
      using errcode = 'insufficient_privilege';
  end if;

  if p_hours < 1 or p_hours > 336 then
    raise exception 'A confirmation link must last between 1 hour and 14 days'
      using errcode = 'invalid_parameter_value';
  end if;

  select p.email, p.first_name into v_email, v_first
    from public.people p where p.id = p_person_id;

  if v_email is null then
    raise exception 'That person has no email address on file'
      using errcode = 'invalid_parameter_value';
  end if;

  -- A resend supersedes. Removed rather than kept so an older link sitting in
  -- an inbox cannot still work; `emails` is where "we wrote to them" is
  -- recorded, so nothing auditable is lost.
  delete from public.email_confirmations c
   where c.person_id = p_person_id and c.confirmed_at is null;

  v_expires := now() + make_interval(hours => p_hours);

  insert into public.email_confirmations (person_id, email, token_hash, expires_at, enrollment_id)
  values (p_person_id, v_email, p_token_hash, v_expires, p_enrollment_id);

  return query select v_email, v_first, v_expires;
end;
$$;

comment on function public.issue_email_confirmation is
  'Records a pending "is this you" link and returns what the email needs. '
  'Admins only; the raw token never reaches the database.';

revoke execute on function public.issue_email_confirmation(uuid, text, uuid, integer) from public, anon;
grant  execute on function public.issue_email_confirmation(uuid, text, uuid, integer) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Spend one
-- ---------------------------------------------------------------------------
-- Every outcome is a returned word rather than an exception, because the
-- caller is a page that has to tell a human what happened. "Expired" and
-- "unknown" need different sentences, and neither is an error in the system.
create or replace function public.confirm_email(p_token_hash text)
returns table (person_id uuid, enrollment_id uuid, outcome text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from public.email_confirmations
   where token_hash = p_token_hash
   for update;

  if c is null then
    return query select null::uuid, null::uuid, 'unknown'::text;
    return;
  end if;

  -- Already spent. Reported as success rather than an error: somebody who
  -- clicks their own link twice has done nothing wrong, and the address is
  -- confirmed either way.
  if c.confirmed_at is not null then
    return query select c.person_id, c.enrollment_id, 'already'::text;
    return;
  end if;

  if c.expires_at <= now() then
    return query select c.person_id, c.enrollment_id, 'expired'::text;
    return;
  end if;

  -- The address is only proved if it is still the address we wrote to. An
  -- admin correcting a typo in the meantime means this link proves nothing
  -- about the current one.
  if not exists (
    select 1 from public.people p
     where p.id = c.person_id and lower(p.email) = lower(c.email)
  ) then
    return query select c.person_id, c.enrollment_id, 'changed'::text;
    return;
  end if;

  update public.email_confirmations set confirmed_at = now() where id = c.id;
  update public.people set email_confirmed_at = now() where id = c.person_id;

  return query select c.person_id, c.enrollment_id, 'confirmed'::text;
end;
$$;

comment on function public.confirm_email is
  'Spends a confirmation link. Service key only — it is reached by a public '
  'route with no session, and the token hash is the whole of the authorisation.';

revoke execute on function public.confirm_email(text) from public, anon, authenticated;
grant  execute on function public.confirm_email(text) to service_role;
