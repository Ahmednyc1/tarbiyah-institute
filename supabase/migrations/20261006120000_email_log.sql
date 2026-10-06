-- ============================================================================
-- Tarbiyah Institute — a record of every email the institute sends
-- ============================================================================
-- Resend keeps its own log, and it is better than this one for deliverability:
-- bounces, opens, the actual SMTP conversation. This table answers a different
-- question, the one the institute actually gets asked:
--
--   "Did Yusuf ever get his receipt?"
--
-- That has to be answerable from the admin screen by somebody who does not have
-- a Resend login — Sh Badawy, the finance manager — and it has to stay
-- answerable if the institute ever moves to another provider. Resend's log is
-- theirs; this one is ours.
--
-- It records the ATTEMPT, not just the success. A row with status 'failed' and
-- the provider's error is the whole point: a missing row and a failed row mean
-- very different things when somebody is asking why they heard nothing.
-- ============================================================================

create table public.emails (
  id           uuid primary key default gen_random_uuid(),

  -- What kind of message this was. Constrained rather than free text so the
  -- admin screen can group by it and a typo cannot invent a category.
  kind         text not null check (kind in (
                 'enrollment_confirmed',   -- paid, you are on the roster
                 'address_confirmation',   -- we typed your address, is it right
                 'grades_published',       -- marks are available
                 'session_published',      -- recording or slides are up
                 'class_reminder'          -- your class meets tomorrow
               )),

  to_address   text not null,
  subject      text not null,

  -- Context, both optional. An address confirmation has no class; a reminder
  -- for a whole roster has no single person. `set null` on delete because the
  -- record that an email was sent outlives the enrollment it was about.
  person_id    uuid references public.people  (id) on delete set null,
  class_id     uuid references public.classes (id) on delete set null,

  -- Resend's own id for the message, so a row here can be matched against
  -- their dashboard when the question is "did it bounce?".
  provider_id  text,

  status       text not null check (status in ('sent', 'failed')),
  error        text,

  created_at   timestamptz not null default now()
);

comment on table public.emails is
  'One row per email the institute attempted to send, successful or not. '
  'Ours rather than the provider''s, so it survives changing provider.';

create index emails_person_idx  on public.emails (person_id, created_at desc);
create index emails_class_idx   on public.emails (class_id, created_at desc);
create index emails_recent_idx  on public.emails (created_at desc);

-- Deliberately NOT unique on anything. The same person may legitimately be
-- emailed the same kind of message twice — a resent receipt, a second
-- reminder — and this table must record what happened rather than enforce what
-- should. Deduplication belongs at the send site, via Resend's idempotency key.


-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
alter table public.emails enable row level security;

-- BYPASSRLS IS NOT A GRANT. service_role needs ordinary table privileges
-- before any policy is consulted — the trap that cost the Stripe webhook a
-- silent failure on seat_holds (20261004130000). The webhook and every other
-- server-side sender writes here, so it is granted explicitly and first.
grant select, insert on public.emails to service_role;

-- Admins read it through the admin screen, as themselves.
grant select on public.emails to authenticated;

create policy emails_admin_read on public.emails
  for select to authenticated
  using (app.is_admin());

-- Nothing for anon, and no insert for authenticated: an email log that a
-- signed-in user could write to is a log that can be made to say anything.
