-- ============================================================================
-- Tarbiyah Institute — seed data
-- ============================================================================
-- One complete class, end to end, so every table has realistic rows in it.
--
-- HOW TO RUN
--   Hosted DB : paste this whole file into the Supabase SQL Editor and run it.
--   Local     : save as supabase/seed.sql — `npx supabase db reset` runs it
--               automatically after replaying your migrations.
--
-- Safe to re-run: it deletes its own seed rows first (and nothing else).
-- It does NOT touch public.admins or any real Auth user.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Clean up any previous run of this seed (matched by the sentinel email domain)
-- ---------------------------------------------------------------------------
-- Order matters. teachers.person_id, students.person_id, classes.course_id and
-- certificates.enrollment_id are all ON DELETE RESTRICT, so deleting people or
-- the course first raises a foreign key violation — children go first.
-- student_grades and attendance need no statement of their own: they CASCADE
-- from enrollments.

delete from public.certificates c
 using public.enrollments e
 join public.classes cl on cl.id = e.class_id
 join public.courses  co on co.id = cl.course_id
 where c.enrollment_id = e.id
   and co.code = 'AQD-101';

delete from public.enrollments e
 using public.classes cl
 join public.courses co on co.id = cl.course_id
 where e.class_id = cl.id
   and co.code = 'AQD-101';

delete from public.classes cl
 using public.courses co
 where cl.course_id = co.id
   and co.code = 'AQD-101';

delete from public.courses where code = 'AQD-101';

delete from public.students s
 using public.people p
 where s.person_id = p.id
   and p.email like '%@seed.tarbiyah.test';

delete from public.teachers t
 using public.people p
 where t.person_id = p.id
   and p.email like '%@seed.tarbiyah.test';

-- The sentinel domain is the safety rail: no real person can match it.
delete from public.people where email like '%@seed.tarbiyah.test';

-- ---------------------------------------------------------------------------
do $$
declare
  v_teacher_person uuid;
  v_teacher        uuid;
  v_course         uuid;
  v_class          uuid;

  v_cat_homework   uuid;
  v_cat_quizzes    uuid;
  v_cat_midterm    uuid;
  v_cat_final      uuid;

  v_hw1 uuid; v_hw2 uuid; v_quiz1 uuid; v_mid uuid; v_fin uuid;

  v_student_ids  uuid[] := '{}';
  v_enroll_ids   uuid[] := '{}';
  v_person       uuid;
  v_student      uuid;
  v_enroll       uuid;

  v_names text[][] := array[
    ['Bilal',  'Hassan',  'male'  ],
    ['Zaynab', 'Ali',     'female'],
    ['Omar',   'Farouk',  'male'  ],
    ['Maryam', 'Siddiqi', 'female'],
    ['Idris',  'Bah',     'male'  ]
  ];
  i int;
begin

  -- =========================================================================
  -- TEACHER
  -- =========================================================================
  insert into public.people (first_name, last_name, email, sex, phone)
  values ('Yusuf', 'Rahman', 'yusuf.rahman@seed.tarbiyah.test', 'male', '718-555-0101')
  returning id into v_teacher_person;

  insert into public.teachers (person_id, bio)
  values (
    v_teacher_person,
    'Studied Aqeedah and Usul al-Fiqh at the Islamic University of Madinah. '
    'Has taught weekend halaqas in Brooklyn for eight years.'
  )
  returning id into v_teacher;

  -- =========================================================================
  -- COURSE + CLASS
  -- =========================================================================
  insert into public.courses (code, title, description)
  values (
    'AQD-101',
    'Aqeedah Level 1',
    'Foundations of Islamic creed: tawheed, the pillars of iman, '
    'and common misconceptions. No prior study required.'
  )
  returning id into v_course;

  -- Created as 'draft' on purpose: the weights-must-sum-to-100 rule is only
  -- enforced once a class leaves draft, so we can add categories one by one.
  insert into public.classes (
    course_id, teacher_id, term, section, status, gender_restriction,
    registration_fee, passing_score, capacity,
    start_date, end_date, location, meeting_schedule
  )
  values (
    v_course, v_teacher, 'Fall 2026', 'A', 'draft', 'mixed',
    75.00, 60, 20,
    '2026-09-13', '2026-12-13', 'Main hall, second floor', 'Sundays 10:00–11:30'
  )
  returning id into v_class;

  -- =========================================================================
  -- GRADING SCHEME  (must total exactly 100)
  -- =========================================================================
  insert into public.grade_categories (class_id, name, weight, position)
  values (v_class, 'Homework', 30, 1) returning id into v_cat_homework;

  insert into public.grade_categories (class_id, name, weight, position)
  values (v_class, 'Quizzes', 20, 2) returning id into v_cat_quizzes;

  insert into public.grade_categories (class_id, name, weight, position)
  values (v_class, 'Midterm', 20, 3) returning id into v_cat_midterm;

  insert into public.grade_categories (class_id, name, weight, position)
  values (v_class, 'Final Exam', 30, 4) returning id into v_cat_final;

  -- Now that the scheme totals 100, the class can open.
  update public.classes set status = 'in_progress' where id = v_class;

  -- =========================================================================
  -- ASSIGNMENTS
  -- =========================================================================
  insert into public.assignments (class_id, grade_category_id, name, description, due_date, max_score, is_published)
  values (v_class, v_cat_homework, 'Homework 1 — The Three Fundamentals',
          'Read pages 1–14 and answer the six questions at the end.',
          '2026-09-27', 20, true)
  returning id into v_hw1;

  insert into public.assignments (class_id, grade_category_id, name, description, due_date, max_score, is_published)
  values (v_class, v_cat_homework, 'Homework 2 — Categories of Tawheed',
          'Write one paragraph on each category with a supporting daleel.',
          '2026-10-11', 20, true)
  returning id into v_hw2;

  insert into public.assignments (class_id, grade_category_id, name, due_date, max_score, is_published)
  values (v_class, v_cat_quizzes, 'Quiz 1', '2026-10-04', 25, true)
  returning id into v_quiz1;

  insert into public.assignments (class_id, grade_category_id, name, due_date, max_score, is_published)
  values (v_class, v_cat_midterm, 'Midterm Exam', '2026-10-25', 50, true)
  returning id into v_mid;

  -- Not published yet — students shouldn't see this one. Tests the
  -- assignments_read_enrolled policy.
  insert into public.assignments (class_id, grade_category_id, name, due_date, max_score, is_published)
  values (v_class, v_cat_final, 'Final Exam', '2026-12-13', 100, false)
  returning id into v_fin;

  -- =========================================================================
  -- STUDENTS + ENROLLMENTS
  -- =========================================================================
  for i in 1 .. array_length(v_names, 1) loop

    insert into public.people (first_name, last_name, email, sex, phone)
    values (
      v_names[i][1],
      v_names[i][2],
      lower(v_names[i][1]) || '.' || lower(v_names[i][2]) || '@seed.tarbiyah.test',
      v_names[i][3],
      '718-555-01' || lpad((10 + i)::text, 2, '0')
    )
    returning id into v_person;

    insert into public.students (person_id, guardian_name, guardian_phone)
    values (
      v_person,
      case when i <= 2 then v_names[i][2] || ' family guardian' else null end,
      case when i <= 2 then '718-555-02' || lpad(i::text, 2, '0') else null end
    )
    returning id into v_student;

    v_student_ids := v_student_ids || v_student;

    -- Payment mix: paid, paid, partial, waived (scholarship), unpaid.
    -- payment_status is set automatically by a trigger from the amounts,
    -- except for 'waived', which is a deliberate manual override.
    insert into public.enrollments (class_id, student_id, amount_due, amount_paid, payment_status, waiver_note)
    values (
      v_class,
      v_student,
      75.00,
      case i when 1 then 75.00 when 2 then 75.00 when 3 then 40.00 when 4 then 0 else 0 end,
      case i when 4 then 'waived' else 'unpaid' end,
      case i when 4 then 'Zakat-funded scholarship approved by the board' else null end
    )
    returning id into v_enroll;

    v_enroll_ids := v_enroll_ids || v_enroll;
  end loop;

  -- =========================================================================
  -- GRADES
  -- =========================================================================
  -- Strong / solid / average / struggling / not-yet-graded.
  -- NULL score = not marked yet, which is different from a zero.
  for i in 1 .. array_length(v_enroll_ids, 1) loop

    insert into public.student_grades (class_id, enrollment_id, assignment_id, score, graded_by, graded_at, feedback)
    values (v_class, v_enroll_ids[i], v_hw1,
            (array[19, 17, 15, 12, 18])[i], v_teacher, now() - interval '20 days',
            (array['Excellent work.', 'Good, watch your references.',
                   'Solid effort.', 'Please see me after class.', 'Very strong.'])[i]);

    insert into public.student_grades (class_id, enrollment_id, assignment_id, score, graded_by, graded_at)
    values (v_class, v_enroll_ids[i], v_hw2,
            (array[20, 16, 14, 9, 17])[i], v_teacher, now() - interval '10 days');

    insert into public.student_grades (class_id, enrollment_id, assignment_id, score, graded_by, graded_at)
    values (v_class, v_enroll_ids[i], v_quiz1,
            (array[24, 21, 18, 13, 22])[i], v_teacher, now() - interval '14 days');

    insert into public.student_grades (class_id, enrollment_id, assignment_id, score, graded_by, graded_at)
    values (v_class, v_enroll_ids[i], v_mid,
            (array[47, 41, 35, 24, 44])[i], v_teacher, now() - interval '3 days');

    -- Final exam row exists but is ungraded (score IS NULL).
    insert into public.student_grades (class_id, enrollment_id, assignment_id, score)
    values (v_class, v_enroll_ids[i], v_fin, null);
  end loop;

  -- =========================================================================
  -- ATTENDANCE — five Sundays
  -- =========================================================================
  for i in 1 .. array_length(v_enroll_ids, 1) loop
    insert into public.attendance (enrollment_id, class_date, status, recorded_by)
    values
      (v_enroll_ids[i], '2026-09-13', 'present', v_teacher),
      (v_enroll_ids[i], '2026-09-20',
        case when i = 4 then 'absent' else 'present' end, v_teacher),
      (v_enroll_ids[i], '2026-09-27',
        case when i = 3 then 'late' else 'present' end, v_teacher),
      (v_enroll_ids[i], '2026-10-04',
        case when i = 4 then 'excused' else 'present' end, v_teacher),
      (v_enroll_ids[i], '2026-10-11', 'present', v_teacher);
  end loop;

  -- =========================================================================
  -- ONE COMPLETED STUDENT + CERTIFICATE
  -- =========================================================================
  -- Student 1 finishes the course. final_score is frozen onto the certificate
  -- on purpose — editing a category weight in 2029 must not rewrite history.
  update public.enrollments
     set status = 'completed', final_score = 94.50, completed_at = now()
   where id = v_enroll_ids[1];

  insert into public.certificates (enrollment_id, final_score, issued_by)
  values (v_enroll_ids[1], 94.50, v_teacher_person);

end;
$$;

commit;


-- ============================================================================
-- CHECK IT WORKED
-- ============================================================================

-- Roster with live weighted grade and payment state
select
  p.first_name || ' ' || p.last_name as student,
  s.student_number,
  e.status,
  e.payment_status,
  e.amount_paid || ' / ' || e.amount_due as paid,
  eg.current_score,
  eg.weight_graded_so_far as pct_of_grade_marked
from public.enrollments e
join public.students s on s.id = e.student_id
join public.people   p on p.id = s.person_id
left join public.enrollment_grades eg on eg.enrollment_id = e.id
order by eg.current_score desc nulls last;

-- Attendance summary per student
select
  p.first_name || ' ' || p.last_name as student,
  count(*) filter (where a.status = 'present') as present,
  count(*) filter (where a.status = 'absent')  as absent,
  count(*) filter (where a.status = 'late')    as late,
  count(*) filter (where a.status = 'excused') as excused
from public.attendance a
join public.enrollments e on e.id = a.enrollment_id
join public.students    s on s.id = e.student_id
join public.people      p on p.id = s.person_id
group by p.first_name, p.last_name
order by 1;

-- Certificates issued
select c.certificate_number, p.first_name || ' ' || p.last_name as student,
       c.final_score, c.issued_at::date
from public.certificates c
join public.enrollments e on e.id = c.enrollment_id
join public.students    s on s.id = e.student_id
join public.people      p on p.id = s.person_id;
