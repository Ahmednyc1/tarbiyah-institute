import { createClient } from "@/lib/supabase/server";

export type ReportRow = {
  enrollmentId: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  teacherName: string | null;
  meetingSchedule: string | null;
  /** The enrollment's own status: enrolled, completed, dropped, failed. */
  status: string;
  classStatus: string;
  passingScore: number;
  /** Frozen once the class is done; live "grade so far" until then. */
  grade: number | null;
  isFinal: boolean;
  passed: boolean | null;
  paymentStatus: string;
  outstanding: number;
  certificateNumber: string | null;
  certificateRevoked: boolean;
};

/**
 * Every class a student has taken, for the report card.
 *
 * Takes the student id explicitly rather than inferring it. RLS would happily
 * hand an admin every enrollment in the institute, and this page means "mine".
 */
export async function getReportCard(studentId: string): Promise<ReportRow[]> {
  const supabase = await createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(
      `id, status, final_score, amount_due, amount_paid, payment_status, enrolled_at,
       classes ( term, status, passing_score, meeting_schedule,
                 courses ( code, title ),
                 teacher_directory ( full_name ) )`,
    )
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false });

  const rows = enrollments ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [liveRes, certRes] = await Promise.all([
    supabase.from("enrollment_grades").select("enrollment_id, current_score").in("enrollment_id", ids),
    supabase
      .from("certificates")
      .select("enrollment_id, certificate_number, revoked_at")
      .in("enrollment_id", ids),
  ]);

  const live = new Map(
    (liveRes.data ?? []).map((g) => [g.enrollment_id as string, g.current_score as number | null]),
  );
  const certs = new Map(
    (certRes.data ?? []).map((c) => [
      c.enrollment_id as string,
      { number: c.certificate_number as string, revoked: c.revoked_at !== null },
    ]),
  );

  return rows.map((row) => {
    const cls = row.classes;
    const finished = cls?.status === "completed" || row.status === "completed";

    // A finished class reports what was recorded at the time, not a number that
    // could still move if someone edits a weight next year.
    const grade = finished ? (row.final_score ?? live.get(row.id) ?? null) : (live.get(row.id) ?? null);
    const passingScore = Number(cls?.passing_score ?? 60);
    const cert = certs.get(row.id);

    return {
      enrollmentId: row.id,
      courseCode: cls?.courses?.code ?? "",
      courseTitle: cls?.courses?.title ?? "",
      term: cls?.term ?? "",
      teacherName: cls?.teacher_directory?.full_name ?? null,
      meetingSchedule: cls?.meeting_schedule ?? null,
      status: row.status,
      classStatus: cls?.status ?? "",
      passingScore,
      grade,
      isFinal: finished,
      // Only a finished class has a verdict. Calling someone a fail in week
      // three off partial marking would be wrong.
      passed: finished && grade !== null ? grade >= passingScore : null,
      paymentStatus: row.payment_status,
      outstanding: Math.max(0, Number(row.amount_due) - Number(row.amount_paid)),
      certificateNumber: cert?.number ?? null,
      certificateRevoked: cert?.revoked ?? false,
    };
  });
}
