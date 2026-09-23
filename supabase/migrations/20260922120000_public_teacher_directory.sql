-- ============================================================================
-- Tarbiyah Institute — public teacher directory
-- ============================================================================
-- The catalogue is public (anon can read `courses` and open `classes`), but the
-- course card shows the instructor's name — and `people` / `teachers` are
-- granted to `authenticated` only. A logged-out visitor therefore saw a class
-- with no teacher.
--
-- Rather than open up `people` (which holds emails, phone numbers and dates of
-- birth), this exposes exactly three columns through a view.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. Honorifics
-- ---------------------------------------------------------------------------
-- `people` had only first/last name, so "Sh Mohammad Badawy" rendered as
-- "Mohammad Badawy". Titles are display-only and optional.

alter table public.people
  add column if not exists title text
    check (title is null or length(trim(title)) > 0);

comment on column public.people.title is
  'Optional honorific for display — "Sh", "Ustadh", "Dr.". Never used for matching.';


-- ---------------------------------------------------------------------------
-- 2. The directory view
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER (security_invoker = off) on purpose: it must read `people`
-- and `teachers`, which the caller cannot. The WHERE clause is the security
-- boundary — only active teachers, and only these columns, ever leave here.

create or replace view public.teacher_directory as
  select
    t.id,
    t.person_id,
    trim(coalesce(p.title || ' ', '') || p.first_name || ' ' || p.last_name) as full_name,
    t.bio
  from public.teachers t
  join public.people   p on p.id = t.person_id
 where t.is_active;

alter view public.teacher_directory set (security_invoker = off);

grant select on public.teacher_directory to anon, authenticated;

comment on view public.teacher_directory is
  'Public-safe teacher names for the course catalogue. Deliberately bypasses RLS '
  'on people/teachers — keep it to display columns only, never contact details.';
