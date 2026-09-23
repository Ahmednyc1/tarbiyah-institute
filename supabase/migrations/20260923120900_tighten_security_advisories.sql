-- ============================================================================
-- Tarbiyah Institute — security advisory clean-up
-- ============================================================================
-- Supabase's database linter raised five notices. Two are real and fixed here;
-- the rest are deliberate and recorded so nobody "fixes" them later and quietly
-- breaks the public catalogue.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. my_roles does not need to be SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- It only calls app.is_admin(), app.current_teacher_id() and friends, which are
-- themselves SECURITY DEFINER and granted to `authenticated`. The view can
-- therefore run as the caller and still resolve — verified to return identical
-- results both ways. One less elevated object for no loss.

alter view public.my_roles set (security_invoker = on);


-- ---------------------------------------------------------------------------
-- 2. rls_auto_enable() should not be callable over the API
-- ---------------------------------------------------------------------------
-- Supabase's automatic-RLS helper: an event trigger that enables RLS on any new
-- public table. It is not exploitable over REST — pg_event_trigger_ddl_commands()
-- only works inside an event trigger, so a direct call errors — but there is no
-- reason for anon or authenticated to hold EXECUTE on it. Event triggers fire as
-- their owner, so revoking this does not stop it working.

revoke execute on function public.rls_auto_enable() from anon, authenticated, public;


-- ---------------------------------------------------------------------------
-- 3. Deliberate: two views stay SECURITY DEFINER
-- ---------------------------------------------------------------------------
-- The linter flags every definer view, because most are accidents. These two
-- are the entire reason anonymous visitors can see a catalogue at all, and the
-- SELECT list is the security boundary in both cases.
--
--   teacher_directory   reads people and teachers, which anon cannot, to publish
--                       an instructor's name, bio and photograph — and nothing
--                       else. No email, no phone, no date of birth.
--
--   class_availability  counts enrollments, which anon cannot read, to say "6 of
--                       40 seats taken". Aggregates only; no row ever escapes.
--
-- Converting either to SECURITY INVOKER returns empty to anonymous visitors: the
-- catalogue loses its instructors and can no longer tell whether a class is
-- full. If a future reader is tempted, that is what will break.

comment on view public.teacher_directory is
  'SECURITY DEFINER on purpose. Publishes instructor name, bio and photo to '
  'anonymous visitors without exposing public.people. Keep the SELECT list to '
  'display columns only — it is the security boundary.';

comment on view public.class_availability is
  'SECURITY DEFINER on purpose. Publishes seat counts to anonymous visitors '
  'without exposing public.enrollments. Aggregates only, never row detail.';

-- Also deliberate: public.admins has RLS enabled and no policies, which the
-- linter reports as "RLS enabled, no policy". That is the intent — the table is
-- revoked from both API roles and reachable only from the SQL editor, so no
-- policy should ever grant access to it.
comment on table public.admins is
  'Add a row here to grant a person full read/write access to everything. '
  'Deliberately unreachable from the Data API: revoked from anon and '
  'authenticated, with RLS on and no policies. The linter flags the absent '
  'policy; that is the point.';
