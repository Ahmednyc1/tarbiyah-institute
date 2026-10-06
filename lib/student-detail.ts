import { createClient } from "@/lib/supabase/server";

export type DetailAssignment = {
  id: string;
  name: string;
  maxScore: number;
  dueDate: string | null;
  isPublished: boolean;
  score: number | null;
  feedback: string | null;
  /** Who set this mark and when. Staff only — a student is not shown it. */
  markedBy: string | null;
  markedAt: string | null;
};

export type DetailSession = {
  number: number;
  date: string;
  title: string | null;
  /** Called off — shown, but counted against nobody. */
  cancelled: boolean;
  status: string;
  note: string | null;
};

/**
 * A session the teacher has made visible, and whatever came with it.
 *
 * Separate from DetailSession, which exists only where there is an attendance
 * row. A recording belongs to the meeting whether or not the register was
 * taken, and a student who missed a week is exactly who wants it.
 */
export type SessionMaterial = {
  number: number;
  date: string;
  title: string | null;
  summary: string | null;
  recordingUrl: string | null;
  cancelled: boolean;
};

export type DetailCategory = {
  id: string;
  name: string;
  weight: number;
  source: "assignments" | "attendance";
  percent: number | null;
  /** Sessions or points actually counted, after grace. */
  counted: number | null;
  /**
   * Points this category puts into the overall grade. Normalised by the weight
   * that actually has marks, so these sum to exactly `currentScore` even when
   * some categories are still empty.
   */
  contributes: number | null;
  assignments: DetailAssignment[];
};

export type EnrollmentDetail = {
  enrollmentId: string;
  classId: string;
  /** Who this belongs to — callers with broader rights must check it. */
  studentId: string;
  studentName: string;
  studentNumber: string;
  courseTitle: string;
  courseCode: string;
  term: string;
  meetingSchedule: string | null;
  teacherName: string | null;
  classStatus: string;
  passingScore: number;
  attendanceGrace: number;
  currentScore: number | null;
  finalScore: number | null;
  weightGraded: number;
  enrollmentStatus: string;
  outstanding: number;
  paymentStatus: string;
  categories: DetailCategory[];
  sessions: DetailSession[];
  materials: SessionMaterial[];
};

/**
 * Everything about one student in one class.
 *
 * Scoped entirely by RLS: a student reaches only their own enrollment, a
 * teacher only their classes, an admin anything. That is safe here — unlike a
 * list page, this asks for one named row, so there is no "whose rows are
 * these?" ambiguity to get wrong.
 *
 * A student also only sees published assignments, so their breakdown and the
 * teacher's can legitimately differ while a draft is being marked.
 */
export async function getEnrollmentDetail(
  enrollmentId: string,
): Promise<EnrollmentDetail | null> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from("enrollments")
    .select(
      `id, class_id, student_id, status, final_score, amount_due, amount_paid, payment_status,
       students ( student_number, people ( title, first_name, last_name ) ),
       classes ( term, status, passing_score, attendance_grace, meeting_schedule,
                 courses ( code, title ),
                 teacher_directory ( full_name ) )`,
    )
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment?.classes) return null;

  const classId = enrollment.class_id;

  const [
    categoriesRes,
    assignmentsRes,
    gradesRes,
    attendanceRes,
    catScoresRes,
    totalRes,
    materialsRes,
  ] = await Promise.all([
      supabase
        .from("grade_categories")
        .select("id, name, weight, position, source")
        .eq("class_id", classId)
        .order("position"),
      supabase
        .from("assignments")
        .select("id, name, max_score, due_date, is_published, grade_category_id")
        .eq("class_id", classId)
        .order("due_date", { nullsFirst: false }),
      supabase
        .from("student_grades")
        // graded_by/graded_at answer "who changed this, and when" — the only
        // question there is an answer to when somebody queries a certificate
        // months later.
        .select("assignment_id, score, feedback, graded_at, people ( title, first_name, last_name )")
        .eq("enrollment_id", enrollmentId),
      supabase
        .from("attendance")
        // The date lives on the session now, so it comes along by join.
        .select("status, note, class_sessions ( session_number, meets_on, title, is_cancelled )")
        .eq("enrollment_id", enrollmentId),
      supabase
        .from("enrollment_category_scores")
        .select("grade_category_id, earned, possible")
        .eq("enrollment_id", enrollmentId),
      supabase
        .from("enrollment_grades")
        .select("current_score, weight_graded_so_far")
        .eq("enrollment_id", enrollmentId)
        .maybeSingle(),
      // Published sessions only. `class_sessions_read_enrolled` already limits
      // a student to the published ones, so this filter is what staff see too
      // — on this page the point is to show what the student sees, and the
      // gradebook has its own editor for drafts.
      supabase
        .from("class_sessions")
        .select("session_number, meets_on, title, summary, recording_url, is_cancelled")
        .eq("class_id", classId)
        .eq("is_published", true)
        .order("session_number"),
    ]);

  const grades = new Map(
    (gradesRes.data ?? []).map((g) => {
      const marker = g.people;
      return [
        g.assignment_id as string,
        {
          score: g.score as number | null,
          feedback: g.feedback as string | null,
          markedAt: g.graded_at as string | null,
          markedBy: marker
            ? [marker.title, marker.first_name, marker.last_name].filter(Boolean).join(" ")
            : null,
        },
      ];
    }),
  );

  const scored = new Map(
    (catScoresRes.data ?? []).map((s) => [
      s.grade_category_id as string,
      { earned: Number(s.earned), possible: Number(s.possible) },
    ]),
  );

  const weightGraded = Number(totalRes.data?.weight_graded_so_far ?? 0);

  const categories: DetailCategory[] = (categoriesRes.data ?? []).map((c) => {
    const hit = scored.get(c.id);
    const percent = hit && hit.possible > 0 ? (100 * hit.earned) / hit.possible : null;

    return {
      id: c.id,
      name: c.name,
      weight: Number(c.weight),
      source: c.source as "assignments" | "attendance",
      percent,
      counted: hit ? hit.possible : null,
      contributes:
        percent !== null && weightGraded > 0 ? (Number(c.weight) / weightGraded) * percent : null,
      assignments: (assignmentsRes.data ?? [])
        .filter((a) => a.grade_category_id === c.id)
        .map((a) => ({
          id: a.id,
          name: a.name,
          maxScore: Number(a.max_score),
          dueDate: a.due_date,
          isPublished: a.is_published,
          score: grades.get(a.id)?.score ?? null,
          feedback: grades.get(a.id)?.feedback ?? null,
          markedAt: grades.get(a.id)?.markedAt ?? null,
          markedBy: grades.get(a.id)?.markedBy ?? null,
        })),
    };
  });

  const person = enrollment.students?.people;
  const cls = enrollment.classes;

  return {
    enrollmentId: enrollment.id,
    classId,
    studentId: enrollment.student_id,
    studentName: person
      ? [person.title, person.first_name, person.last_name].filter(Boolean).join(" ")
      : "Unknown",
    studentNumber: enrollment.students?.student_number ?? "",
    courseTitle: cls.courses?.title ?? "",
    courseCode: cls.courses?.code ?? "",
    term: cls.term,
    meetingSchedule: cls.meeting_schedule,
    teacherName: cls.teacher_directory?.full_name ?? null,
    classStatus: cls.status,
    passingScore: Number(cls.passing_score),
    attendanceGrace: Number(cls.attendance_grace),
    currentScore: totalRes.data?.current_score ?? null,
    finalScore: enrollment.final_score,
    weightGraded,
    enrollmentStatus: enrollment.status,
    outstanding: Math.max(0, Number(enrollment.amount_due) - Number(enrollment.amount_paid)),
    paymentStatus: enrollment.payment_status,
    categories,
    sessions: (attendanceRes.data ?? [])
      .map((a) => ({
        number: a.class_sessions?.session_number ?? 0,
        date: a.class_sessions?.meets_on ?? "",
        title: a.class_sessions?.title ?? null,
        cancelled: a.class_sessions?.is_cancelled ?? false,
        status: a.status as string,
        note: a.note as string | null,
      }))
      .sort((x, y) => x.number - y.number),
    materials: (materialsRes.data ?? []).map((s) => ({
      number: s.session_number,
      date: s.meets_on,
      title: s.title,
      summary: s.summary,
      recordingUrl: s.recording_url,
      cancelled: s.is_cancelled,
    })),
  };
}
