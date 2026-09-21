-- ============================================================================
-- Tarbiyah Institute — initial schema
-- ============================================================================
-- Run with:  npx supabase db push
-- RLS policies live in the NEXT migration (20260921120100_rls_policies.sql).
-- ============================================================================

create extension if not exists moddatetime with schema extensions;

-- Helper functions live in their own schema so they are not exposed by the
-- Data API. The Data API only serves the `public` schema.
create schema if not exists app;


-- ============================================================================
-- 1. PEOPLE  — one row per human being, whatever role they play
-- ============================================================================

create table public.people (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users (id) on delete set null,
  first_name    text not null check (length(trim(first_name)) > 0),
  last_name     text not null check (length(trim(last_name))  > 0),
  email         text,
  phone         text,
  sex           text not null check (sex in ('male', 'female')),
  date_of_birth date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Case-insensitive uniqueness, but only for people who actually have an email.
-- Young students often won't.
create unique index people_email_unique
  on public.people (lower(email))
  where email is not null;

create index people_auth_user_id_idx on public.people (auth_user_id);

comment on column public.people.auth_user_id is
  'Links to Supabase Auth. NULL for people with no login (e.g. minors).';


-- ============================================================================
-- 2. ROLES  — teachers, students, admins are all *roles* a person can hold
-- ============================================================================

create table public.teachers (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null unique references public.people (id) on delete restrict,
  bio        text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create sequence public.student_number_seq start 1000;

create table public.students (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null unique references public.people (id) on delete restrict,
  student_number text not null unique
                 default 'S' || lpad(nextval('public.student_number_seq')::text, 5, '0'),
  guardian_name  text,
  guardian_phone text,
  notes          text,
  enrolled_since date not null default current_date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Institute staff. Membership here grants full access via RLS.
create table public.admins (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null unique references public.people (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is
  'Add a row here to grant a person full read/write access to everything.';


-- ============================================================================
-- 3. COURSES & CLASSES
-- ============================================================================
-- `courses` is the catalogue: "Aqeedah Level 1" exists as a concept.
-- `classes` is one offering of it: this teacher, this term, this roster.
-- Running the same course again next term = a new `classes` row.

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,          -- e.g. 'AQD-101'
  title       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.classes (
  id                  uuid primary key default gen_random_uuid(),
  course_id           uuid not null references public.courses  (id) on delete restrict,
  teacher_id          uuid not null references public.teachers (id) on delete restrict,
  term                text not null,                        -- 'Fall 2026', 'Ramadan 1448'
  section             text,                                 -- 'A' / 'B' if run twice in a term
  status              text not null default 'draft'
                        check (status in ('draft','open','in_progress','completed','cancelled')),
  gender_restriction  text not null default 'mixed'
                        check (gender_restriction in ('male','female','mixed')),
  registration_fee    numeric(10,2) not null default 0 check (registration_fee >= 0),
  passing_score       numeric(5,2)  not null default 60 check (passing_score between 0 and 100),
  capacity            integer check (capacity > 0),
  start_date          date,
  end_date            date,
  location            text,
  meeting_schedule    text,                                 -- 'Sundays 10:00–11:30'
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint classes_dates_ordered check (end_date is null or start_date is null or end_date >= start_date),
  constraint classes_unique_offering unique (course_id, term, section)
);

-- Needed so child tables can prove they belong to the same class (see below).
alter table public.classes add constraint classes_id_self_unique unique (id);

create index classes_teacher_idx on public.classes (teacher_id);
create index classes_course_idx  on public.classes (course_id);
create index classes_status_idx  on public.classes (status);


-- ============================================================================
-- 4. ENROLLMENTS  — the heart of the system
-- ============================================================================
-- Everything a student does in a class hangs off this row, so it is impossible
-- to record a grade or an absence for someone who isn't in the class.
-- The fee is COPIED here at signup: raising a class fee later must not silently
-- rewrite what past students owed.

create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes  (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete restrict,
  status         text not null default 'enrolled'
                   check (status in ('enrolled','dropped','completed','failed')),

  amount_due     numeric(10,2) not null default 0 check (amount_due  >= 0),
  amount_paid    numeric(10,2) not null default 0 check (amount_paid >= 0),
  payment_status text not null default 'unpaid'
                   check (payment_status in ('unpaid','partial','paid','waived')),
  waiver_note    text,                       -- zakat / sadaqah scholarship reason

  final_score    numeric(5,2) check (final_score between 0 and 100),
  enrolled_at    timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint enrollments_unique_student_per_class unique (class_id, student_id)
);

-- Composite key: lets child tables reference (enrollment, class) as a pair.
alter table public.enrollments
  add constraint enrollments_id_class_unique unique (id, class_id);

create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_class_idx   on public.enrollments (class_id);


-- ============================================================================
-- 5. GRADING STRUCTURE
-- ============================================================================

create table public.grade_categories (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.classes (id) on delete cascade,
  name        text not null,                       -- 'Homework', 'Midterm', 'Final'
  weight      numeric(5,2) not null check (weight > 0 and weight <= 100),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint grade_categories_unique_name_per_class unique (class_id, name)
);

-- Lets `assignments` prove its category belongs to the same class.
alter table public.grade_categories
  add constraint grade_categories_id_class_unique unique (id, class_id);


create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null,
  grade_category_id uuid not null,
  name              text not null,
  description       text,
  due_date          date,
  max_score         numeric(6,2) not null check (max_score > 0),
  is_published      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint assignments_class_fk
    foreign key (class_id) references public.classes (id) on delete cascade,

  -- The important one: an assignment cannot point at another class's category.
  constraint assignments_category_same_class_fk
    foreign key (grade_category_id, class_id)
    references public.grade_categories (id, class_id) on delete cascade
);

alter table public.assignments
  add constraint assignments_id_class_unique unique (id, class_id);

create index assignments_class_idx    on public.assignments (class_id);
create index assignments_category_idx on public.assignments (grade_category_id);


create table public.student_grades (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null,
  enrollment_id uuid not null,
  assignment_id uuid not null,

  -- NULL = not graded yet. 0 = submitted and scored zero. Keep them distinct
  -- or your class averages will be wrong.
  score         numeric(6,2) check (score >= 0),
  feedback      text,
  graded_at     timestamptz,
  graded_by     uuid references public.teachers (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Both parents must agree on the class, so a grade can never cross classes.
  constraint student_grades_enrollment_fk
    foreign key (enrollment_id, class_id)
    references public.enrollments (id, class_id) on delete cascade,
  constraint student_grades_assignment_fk
    foreign key (assignment_id, class_id)
    references public.assignments (id, class_id) on delete cascade,

  constraint student_grades_one_per_assignment unique (enrollment_id, assignment_id)
);

create index student_grades_assignment_idx on public.student_grades (assignment_id);
create index student_grades_enrollment_idx on public.student_grades (enrollment_id);


-- ============================================================================
-- 6. ATTENDANCE
-- ============================================================================

create table public.attendance (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  class_date    date not null,
  status        text not null check (status in ('present','absent','late','excused')),
  note          text,
  recorded_by   uuid references public.teachers (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint attendance_one_per_day unique (enrollment_id, class_date)
);

create index attendance_date_idx on public.attendance (class_date);


-- ============================================================================
-- 7. CERTIFICATES
-- ============================================================================
-- final_score is FROZEN here on purpose. If someone edits a category weight in
-- 2029, the certificate you printed in 2026 must still say what it said.

create sequence public.certificate_number_seq start 1;

create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  enrollment_id      uuid not null unique references public.enrollments (id) on delete restrict,
  certificate_number text not null unique
                     default 'TI-' || to_char(now(), 'YYYY') || '-' ||
                             lpad(nextval('public.certificate_number_seq')::text, 4, '0'),
  final_score        numeric(5,2) not null check (final_score between 0 and 100),
  issued_at          timestamptz not null default now(),
  issued_by          uuid references public.people (id) on delete set null,
  revoked_at         timestamptz,
  revoked_reason     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);


-- ============================================================================
-- 8. INTEGRITY TRIGGERS
-- ============================================================================

-- 8a. A score may not exceed its assignment's max_score.
create or replace function app.check_grade_score()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max numeric;
begin
  if new.score is null then
    return new;
  end if;

  select max_score into v_max
    from public.assignments
   where id = new.assignment_id;

  if new.score > v_max then
    raise exception 'Score % exceeds the assignment maximum of %', new.score, v_max
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger student_grades_score_within_max
  before insert or update of score, assignment_id on public.student_grades
  for each row execute function app.check_grade_score();


-- 8b. Grade category weights must sum to exactly 100 — but only once the class
-- leaves 'draft', so you can build the grading scheme up piece by piece.
create or replace function app.check_category_weights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_status   text;
  v_sum      numeric;
begin
  if tg_op = 'DELETE' then
    v_class_id := old.class_id;
  else
    v_class_id := new.class_id;
  end if;

  select status into v_status from public.classes where id = v_class_id;

  -- Class is gone (cascade delete) or still being set up: nothing to enforce.
  if v_status is null or v_status = 'draft' then
    return null;
  end if;

  select coalesce(sum(weight), 0) into v_sum
    from public.grade_categories
   where class_id = v_class_id;

  if v_sum <> 100 then
    raise exception
      'Grade category weights for this class must sum to 100 (currently %)', v_sum
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

-- DEFERRABLE: the check runs at COMMIT, so you can insert all four categories
-- in one transaction without tripping over the intermediate totals.
create constraint trigger grade_categories_weights_sum_to_100
  after insert or update or delete on public.grade_categories
  deferrable initially deferred
  for each row execute function app.check_category_weights();


-- 8c. Same check when a class is promoted out of 'draft'.
create or replace function app.check_weights_on_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sum numeric;
begin
  if new.status = 'draft' or new.status = 'cancelled' then
    return new;
  end if;

  select coalesce(sum(weight), 0) into v_sum
    from public.grade_categories
   where class_id = new.id;

  if v_sum <> 100 then
    raise exception
      'Cannot move this class out of draft: grade weights sum to %, not 100', v_sum
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger classes_weights_valid_before_open
  before update of status on public.classes
  for each row
  when (old.status is distinct from new.status)
  execute function app.check_weights_on_status_change();


-- 8d. Keep payment_status honest against the amounts.
create or replace function app.sync_payment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.payment_status = 'waived' then
    return new;                                    -- manual override, leave alone
  elsif new.amount_paid = 0 then
    new.payment_status := 'unpaid';
  elsif new.amount_paid >= new.amount_due then
    new.payment_status := 'paid';
  else
    new.payment_status := 'partial';
  end if;
  return new;
end;
$$;

create trigger enrollments_sync_payment_status
  before insert or update of amount_due, amount_paid, payment_status
  on public.enrollments
  for each row execute function app.sync_payment_status();


-- ============================================================================
-- 9. updated_at ON EVERY TABLE
-- ============================================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'people','teachers','students','courses','classes','enrollments',
    'grade_categories','assignments','student_grades','attendance','certificates'
  ]
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function extensions.moddatetime(updated_at)', t);
  end loop;
end;
$$;


-- ============================================================================
-- 10. CONVENIENCE VIEW — live weighted grade per enrollment
-- ============================================================================
-- Category score = sum(scores) / sum(max_scores) within that category.
-- Ungraded assignments (score IS NULL) are excluded, so this reads as
-- "grade so far" rather than punishing work that hasn't been marked yet.

create or replace view public.enrollment_grades as
with category_scores as (
  select
    e.id                                as enrollment_id,
    e.class_id,
    gc.id                               as grade_category_id,
    gc.weight,
    sum(sg.score)                       as earned,
    sum(a.max_score)                    as possible
  from public.enrollments e
  join public.grade_categories gc on gc.class_id = e.class_id
  join public.assignments a       on a.grade_category_id = gc.id
  join public.student_grades sg   on sg.enrollment_id = e.id
                                 and sg.assignment_id = a.id
  where sg.score is not null
  group by e.id, e.class_id, gc.id, gc.weight
)
select
  cs.enrollment_id,
  cs.class_id,
  round(
    sum(cs.weight * cs.earned / nullif(cs.possible, 0))
      / nullif(sum(cs.weight), 0)
  , 2) as current_score,
  sum(cs.weight) as weight_graded_so_far
from category_scores cs
group by cs.enrollment_id, cs.class_id;

comment on view public.enrollment_grades is
  'Live weighted grade. Certificates store their own frozen final_score.';
