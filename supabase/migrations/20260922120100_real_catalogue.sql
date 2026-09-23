-- ============================================================================
-- Tarbiyah Institute — the real catalogue
-- ============================================================================
-- Recovered from the previous Lovable project (wlvexjooavowvthqxmlc). This is
-- reference data, not demo data: it is what the institute actually offers, so
-- it lives in a migration rather than seed.sql.
--
-- Re-runnable: every insert is keyed on a natural unique column.
--
-- Two of the three courses have no `classes` row. They are real courses with no
-- offering scheduled yet ("TBA" / "Coming Soon" in the old system), and
-- `classes.teacher_id` is NOT NULL, so they cannot be represented as classes
-- until a teacher and a term are known. The catalogue renders them as
-- "registration opening soon".
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. The teacher
-- ---------------------------------------------------------------------------

insert into public.people (title, first_name, last_name, sex)
select 'Sh', 'Mohammad', 'Badawy', 'male'
where not exists (
  select 1
    from public.people
   where first_name = 'Mohammad'
     and last_name  = 'Badawy'
);

insert into public.teachers (person_id, bio)
select p.id, null
  from public.people p
 where p.first_name = 'Mohammad'
   and p.last_name  = 'Badawy'
on conflict (person_id) do nothing;


-- ---------------------------------------------------------------------------
-- 2. Courses
-- ---------------------------------------------------------------------------

insert into public.courses (code, title, description) values
  ('QUR-101', 'Sciences of the Quran',
   'An introductory look into the Quran and its various sciences. Primary text: Al-Tibyān fī ‘Ulūm al-Qur’ān by Shaykh Muḥammad ‘Alī aṣ-Ṣābūnī.'),
  ('FQH-101', 'Fiqh of Fasting',
   'An intensive covering the rulings and principles needed to ensure a successful Ramadan.'),
  ('SPK-101', 'Owning the Mic',
   'Public speaking is often cited as the #1 fear — beating heights, spiders, and even death! This course will equip you with the skills and training to own the mic. Learn to speak with confidence at any occasion.')
on conflict (code) do update
  set title       = excluded.title,
      description = excluded.description;


-- ---------------------------------------------------------------------------
-- 3. The one live offering
-- ---------------------------------------------------------------------------
-- NOTE: inserted directly as 'open'. The weights-sum-to-100 check
-- (classes_weights_valid_before_open) is a BEFORE UPDATE trigger, so it does
-- not fire on INSERT — this class is therefore open for registration with no
-- grading scheme defined yet. See the note at the bottom of this file.

-- `classes_unique_offering` is UNIQUE (course_id, term, section) and section is
-- NULL here — under Postgres' default NULLS DISTINCT that constraint never
-- matches, so ON CONFLICT would not stop a second insert. Hence NOT EXISTS.

insert into public.classes (
  course_id, teacher_id, term, status, gender_restriction,
  registration_fee, capacity, meeting_schedule
)
select
  c.id, t.id, 'Fall 2026', 'open', 'mixed',
  50.00, 40, 'Sundays 10:00 AM–12:30 PM'
  from public.courses  c
  join public.people   p on p.first_name = 'Mohammad' and p.last_name = 'Badawy'
  join public.teachers t on t.person_id = p.id
 where c.code = 'QUR-101'
   and not exists (
     select 1
       from public.classes x
      where x.course_id = c.id
        and x.term      = 'Fall 2026'
        and x.section is null
   );


-- ============================================================================
-- KNOWN GAP (not fixed here — needs a grading scheme decision first)
-- ============================================================================
-- `classes_weights_valid_before_open` only guards UPDATE, so a class can be
-- INSERTed straight into 'open' with no grade_categories at all. To close it,
-- add an INSERT branch to that trigger — but every class must then have its
-- grading scheme created in the same transaction.
-- ============================================================================
