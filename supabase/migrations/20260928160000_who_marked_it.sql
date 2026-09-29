-- ============================================================================
-- Tarbiyah Institute — record who set a mark, not just when
-- ============================================================================
-- student_grades.graded_by and attendance.recorded_by both reference
-- `teachers`, so an administrator who is not a teacher has no value that can
-- represent them. The application already tries to fill these in and writes
-- NULL every time. The result today: 68 marks and 45 register entries, and not
-- one of them names anybody.
--
-- That matters because the institute issues certificates carrying a frozen
-- final score. When somebody asks in eight months why a mark changed, the
-- honest answer is currently "I remember doing it" — a volunteer's memory as
-- the only record of a change to somebody's certificate.
--
-- Pointing at `people` instead lets a teacher OR an admin be named. Both
-- columns are entirely NULL, so there is nothing to migrate.
--
-- Deliberately NOT a history table. Three trusted people can change a mark
-- here, and who-and-when answers the realistic question — "was this changed
-- after the sheikh marked it, and by whom" — while what-it-used-to-be answers
-- a dispute about a number nobody wrote down. That is rarer than it is worth
-- building for today, and can be added when the institute has enough teachers
-- for it to matter.
-- ============================================================================

alter table public.student_grades
  drop constraint if exists student_grades_graded_by_fkey;

alter table public.student_grades
  add constraint student_grades_graded_by_fkey
  foreign key (graded_by) references public.people (id) on delete set null;

comment on column public.student_grades.graded_by is
  'The person who set this mark — a teacher or an administrator. ON DELETE SET '
  'NULL: losing the marker must never delete the mark.';


alter table public.attendance
  drop constraint if exists attendance_recorded_by_fkey;

alter table public.attendance
  add constraint attendance_recorded_by_fkey
  foreign key (recorded_by) references public.people (id) on delete set null;

comment on column public.attendance.recorded_by is
  'The person who took the register. A teacher or an administrator.';
