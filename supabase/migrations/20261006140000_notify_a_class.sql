-- ============================================================================
-- Tarbiyah Institute — telling a whole class something
-- ============================================================================
-- The confirmation email had one recipient and one enrollment. "The recording
-- is up" and "your marks are out" have thirty, and two new problems with them.
--
-- FIRST: ONCE, EVER. Both are triggered by a checkbox inside a save action,
-- and a teacher saves repeatedly — fixing a typo, correcting a date. Only the
-- crossing from unpublished to published should reach anybody's inbox, and
-- only the first one. Resend's idempotency key cannot be the answer: it is
-- honoured for 24 hours, and a teacher who unpublishes and republishes a week
-- later would send again.
--
-- So `emails` gains `context_id` — the session or assignment the message was
-- about — and the send site asks this table whether it has already gone. A
-- durable record rather than a provider's cache.
--
-- SECOND: who may read thirty students' addresses. The roster function is the
-- only way to enumerate them, so it checks inside that the caller actually
-- teaches the class or administers the institute. A teacher may notify their
-- own class and learn nothing about anybody else's.
-- ============================================================================

alter table public.emails add column context_id uuid;

comment on column public.emails.context_id is
  'The thing the email was about — a class_sessions.id or an assignments.id. '
  'Deliberately untyped and unconstrained: it spans tables, and the record '
  'that a message was sent must outlive the row that prompted it.';

-- Answers "has this already gone out?" without scanning.
create index emails_context_idx on public.emails (kind, context_id)
  where context_id is not null;


-- ---------------------------------------------------------------------------
-- Who is on the roster, and where to write to them
-- ---------------------------------------------------------------------------
create or replace function public.class_roster_email_context(p_class_id uuid)
returns table (
  person_id  uuid,
  first_name text,
  email      text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- SECURITY DEFINER reads past every policy, so the check has to be here.
  -- Without it this function is a way for any signed-in person to download the
  -- email address of every student in the institute, one class at a time.
  if not (app.teaches_class(p_class_id) or app.is_admin()) then
    raise exception 'You do not teach that class'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id, p.first_name, p.email
      from public.enrollments e
      join public.students s on s.id = e.student_id
      join public.people   p on p.id = s.person_id
     where e.class_id = p_class_id
       and e.status <> 'dropped'
       -- Somebody enrolled at the desk may have no address on file. They are
       -- excluded here rather than filtered later, so the caller's count is
       -- the number of people who will actually be written to.
       and p.email is not null
     order by p.first_name;
end;
$$;

comment on function public.class_roster_email_context is
  'Addresses for the live enrollments on one class. Checks inside that the '
  'caller teaches it or administers the institute — it is the only way to '
  'enumerate student addresses, so the check cannot live at the call site.';

revoke execute on function public.class_roster_email_context(uuid) from public, anon;
grant  execute on function public.class_roster_email_context(uuid) to authenticated, service_role;
