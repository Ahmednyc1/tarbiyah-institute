import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AttendanceRegister,
  type RegisterStudent,
  type SessionSummary,
} from "@/components/attendance-register";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage({
  params,
  searchParams,
}: PageProps<"/gradebook/[classId]/attendance">) {
  const { classId } = await params;
  const { date } = await searchParams;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, term, meeting_schedule, courses ( code, title )")
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [enrollmentsRes, attendanceRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select("id, status, students ( student_number, people ( title, first_name, last_name ) )")
      .eq("class_id", classId)
      .neq("status", "dropped"),
    supabase
      .from("attendance")
      .select("enrollment_id, class_date, status, enrollments!inner ( class_id )")
      .eq("enrollments.class_id", classId)
      .order("class_date", { ascending: false }),
  ]);

  const attendance = attendanceRes.data ?? [];

  // Every date the register has been taken, newest first.
  const sessionDates = [...new Set(attendance.map((a) => a.class_date as string))].sort().reverse();

  const selectedDate =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().slice(0, 10);

  const marksForDate = new Map(
    attendance
      .filter((a) => a.class_date === selectedDate)
      .map((a) => [a.enrollment_id as string, a.status as string]),
  );

  const byStudentAndDate = new Map(
    attendance.map((a) => [`${a.enrollment_id}:${a.class_date}`, a.status as string]),
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
        current: marksForDate.get(e.id) ?? "",
        history: Object.fromEntries(
          sessionDates.map((d) => [d, byStudentAndDate.get(`${e.id}:${d}`) ?? ""]),
        ),
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const sessions: SessionSummary[] = sessionDates.map((d) => ({
    date: d,
    marked: attendance.filter((a) => a.class_date === d).length,
  }));

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

      <AttendanceRegister
        classId={classId}
        selectedDate={selectedDate}
        students={students}
        sessions={sessions}
      />
    </div>
  );
}
