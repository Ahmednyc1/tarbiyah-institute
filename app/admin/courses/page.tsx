import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CourseCardEditor,
  NewCourseForm,
  type CourseRecord,
  type TeacherOption,
} from "@/components/course-editor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Courses" };

export default async function CataloguePage() {
  const supabase = await createClient();

  const [coursesRes, classesRes, teachersRes] = await Promise.all([
    supabase.from("courses").select("id, code, title, description, is_active").order("code"),
    supabase
      .from("classes")
      .select(
        `id, course_id, term, section, status, teacher_id, registration_fee, capacity,
         meeting_schedule, location, start_date, end_date,
         enrollments ( count ), grade_categories ( weight )`,
      )
      .order("start_date", { nullsFirst: false }),
    supabase.from("teacher_directory").select("id, full_name").order("full_name"),
  ]);

  const teachers: TeacherOption[] = (teachersRes.data ?? [])
    .filter((t): t is { id: string; full_name: string } => Boolean(t.id && t.full_name))
    .map((t) => ({ id: t.id, name: t.full_name }));

  const classes = classesRes.data ?? [];

  const courses: CourseRecord[] = (coursesRes.data ?? []).map((course) => {
    // One run per course by design. If an older course somehow has more than
    // one, the most recent is shown — nothing in the interface creates a second.
    const run = classes.find((c) => c.course_id === course.id) ?? null;

    return {
      id: course.id,
      classId: run?.id ?? null,
      code: course.code,
      title: course.title,
      description: course.description,
      isActive: course.is_active,
      term: run?.term ?? "",
      teacherId: run?.teacher_id ?? null,
      status: run?.status ?? "draft",
      fee: Number(run?.registration_fee ?? 0),
      capacity: run?.capacity ?? null,
      schedule: run?.meeting_schedule ?? null,
      location: run?.location ?? null,
      startDate: run?.start_date ?? null,
      endDate: run?.end_date ?? null,
      enrolled: run ? ((run.enrollments as unknown as { count: number }[])[0]?.count ?? 0) : 0,
      weightTotal: run
        ? (run.grade_categories as unknown as { weight: number }[]).reduce(
            (sum, g) => sum + Number(g.weight),
            0,
          )
        : 0,
    };
  });

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Admin
      </Link>

      <p className="eyebrow mt-6">Administration</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">Courses</h1>
      <p className="mt-4 max-w-2xl text-lg text-foreground/75">
        Everything the institute teaches. A course is created as a draft — set its grading scheme,
        then publish it to open registration.
      </p>

      {teachers.length === 0 ? (
        <p className="mt-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          There are no teachers on file, so a course cannot be set up yet — every course needs
          one. Adding teachers is not built yet.
        </p>
      ) : null}

      <div className="mt-8">
        <NewCourseForm teachers={teachers} />
      </div>

      {courses.length === 0 ? (
        <p className="mt-10 text-muted-foreground">No courses yet.</p>
      ) : (
        <div className="mt-10 space-y-10">
          {courses.map((course) => (
            <CourseCardEditor key={course.id} course={course} teachers={teachers} />
          ))}
        </div>
      )}
    </div>
  );
}
