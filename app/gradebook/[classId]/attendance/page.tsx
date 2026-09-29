import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarPlus } from "lucide-react";
import {
  AttendanceRegister,
  type RegisterSession,
  type RegisterStudent,
} from "@/components/attendance-register";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({
  params,
  searchParams,
}: PageProps<"/gradebook/[classId]/attendance">) {
  const { classId } = await params;
  const { session } = await searchParams;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, term, meeting_schedule, courses ( code, title )")
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [sessionsRes, enrollmentsRes, attendanceRes] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id, session_number, meets_on, title, is_cancelled")
      .eq("class_id", classId)
      .order("session_number"),
    supabase
      .from("enrollments")
      .select("id, status, students ( student_number, people ( title, first_name, last_name ) )")
      .eq("class_id", classId)
      .neq("status", "dropped"),
    supabase
      .from("attendance")
      .select("enrollment_id, session_id, status, class_sessions!inner ( class_id )")
      .eq("class_sessions.class_id", classId),
  ]);

  const allSessions = sessionsRes.data ?? [];
  const attendance = attendanceRes.data ?? [];

  const marked = new Map<string, number>();
  for (const row of attendance) {
    const id = row.session_id as string;
    marked.set(id, (marked.get(id) ?? 0) + 1);
  }

  const sessions: RegisterSession[] = allSessions.map((s) => ({
    id: s.id,
    number: s.session_number,
    meetsOn: s.meets_on,
    title: s.title,
    isCancelled: s.is_cancelled,
    marked: marked.get(s.id) ?? 0,
  }));

  // Default to the next session that has not been marked — the one a teacher
  // is almost always here for. Failing that, the most recent.
  const requested = typeof session === "string" ? sessions.find((s) => s.id === session) : undefined;
  const nextUnmarked = sessions.find((s) => !s.isCancelled && s.marked === 0);
  const selected = requested ?? nextUnmarked ?? sessions.at(-1) ?? null;

  const marksForSession = new Map(
    attendance
      .filter((a) => a.session_id === selected?.id)
      .map((a) => [a.enrollment_id as string, a.status as string]),
  );

  const byStudentAndSession = new Map(
    attendance.map((a) => [`${a.enrollment_id}:${a.session_id}`, a.status as string]),
  );

  const students: RegisterStudent[] = (enrollmentsRes.data ?? [])
    .map((e) => {
      const person = e.students?.people;
      return {
        enrollmentId: e.id,
        studentNumber: e.students?.student_number ?? "",
        name: person
          ? [person.title, person.first_name, person.last_name].filter(Boolean).join(" ")
          : "Unknown",
        sortKey: person ? `${person.last_name} ${person.first_name}` : "zzz",
        current: selected ? (marksForSession.get(e.id) ?? "") : "",
        history: Object.fromEntries(
          sessions.map((s) => [s.id, byStudentAndSession.get(`${e.id}:${s.id}`) ?? ""]),
        ),
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <Link
        href={`/gradebook/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marks
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code} · Attendance</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{cls.courses?.title}</h1>
      <p className="mt-3 text-muted-foreground">
        {cls.term}
        {cls.meeting_schedule ? ` · ${cls.meeting_schedule}` : ""}
      </p>

      {sessions.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-card">
          <p className="text-foreground/75">
            This class has no sessions yet, so there is nothing to take a register against.
          </p>
          <Button asChild className="mt-5 bg-primary hover:bg-primary-deep">
            <Link href={`/gradebook/${classId}/sessions`}>
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Lay out the term
            </Link>
          </Button>
        </div>
      ) : (
        <AttendanceRegister
          classId={classId}
          sessions={sessions}
          selectedId={selected?.id ?? null}
          students={students}
        />
      )}
    </div>
  );
}
