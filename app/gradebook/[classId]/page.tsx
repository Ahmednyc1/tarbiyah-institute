import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradebookGrid, type CategoryGroup, type StudentRow } from "@/components/gradebook-grid";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Gradebook" };

export default async function ClassGradebookPage({ params }: PageProps<"/gradebook/[classId]">) {
  const { classId } = await params;
  const supabase = await createClient();

  // RLS returns nothing for a class the caller may not grade, so a missing row
  // and a forbidden one are indistinguishable here — which is what we want.
  const { data: cls } = await supabase
    .from("classes")
    .select(
      `id, term, section, status, passing_score, meeting_schedule,
       courses ( code, title ),
       teacher_directory ( full_name )`,
    )
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [categoriesRes, assignmentsRes, enrollmentsRes, gradesRes, totalsRes, catScoresRes] =
    await Promise.all([
      supabase
        .from("grade_categories")
        .select("id, name, weight, position, source")
        .eq("class_id", classId)
        .order("position"),
      supabase
        .from("assignments")
        .select("id, name, max_score, grade_category_id, is_published, due_date")
        .eq("class_id", classId)
        .order("due_date", { nullsFirst: false }),
      supabase
        .from("enrollments")
        .select("id, status, students ( student_number, people ( title, first_name, last_name ) )")
        .eq("class_id", classId),
      supabase
        .from("student_grades")
        .select("enrollment_id, assignment_id, score")
        .eq("class_id", classId),
      supabase
        .from("enrollment_grades")
        .select("enrollment_id, current_score, weight_graded_so_far")
        .eq("class_id", classId),
      supabase
        .from("enrollment_category_scores")
        .select("enrollment_id, grade_category_id, earned, possible")
        .eq("class_id", classId),
    ]);

  const categories = categoriesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];

  const groups: CategoryGroup[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    weight: Number(c.weight),
    source: c.source as "assignments" | "attendance",
    columns: assignments
      .filter((a) => a.grade_category_id === c.id)
      .map((a) => ({
        id: a.id,
        name: a.name,
        maxScore: Number(a.max_score),
        isPublished: a.is_published,
      })),
  }));

  const totals = new Map(
    (totalsRes.data ?? []).map((t) => [
      t.enrollment_id as string,
      { current: t.current_score as number | null, weight: Number(t.weight_graded_so_far ?? 0) },
    ]),
  );

  const catScores = new Map(
    (catScoresRes.data ?? []).map((s) => [
      `${s.enrollment_id}:${s.grade_category_id}`,
      Number(s.possible) > 0 ? (100 * Number(s.earned)) / Number(s.possible) : null,
    ]),
  );

  const scores = new Map(
    (gradesRes.data ?? []).map((g) => [
      `${g.enrollment_id}:${g.assignment_id}`,
      g.score === null ? "" : String(g.score),
    ]),
  );

  const students: StudentRow[] = (enrollmentsRes.data ?? [])
    .map((e) => {
      const person = e.students?.people;
      const total = totals.get(e.id);
      return {
        enrollmentId: e.id,
        status: e.status,
        studentNumber: e.students?.student_number ?? "",
        name: person
          ? [person.title, person.first_name, person.last_name].filter(Boolean).join(" ")
          : "Unknown",
        sortKey: person ? `${person.last_name} ${person.first_name}` : "zzz",
        currentScore: total?.current ?? null,
        weightGraded: total?.weight ?? 0,
        scores: Object.fromEntries(
          groups
            .flatMap((g) => g.columns)
            .map((col) => [col.id, scores.get(`${e.id}:${col.id}`) ?? ""]),
        ),
        computed: Object.fromEntries(
          groups
            .filter((g) => g.source === "attendance")
            .map((g) => [g.id, catScores.get(`${e.id}:${g.id}`) ?? null]),
        ),
      };
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const weightTotal = groups.reduce((s, g) => s + g.weight, 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <Link
        href="/gradebook"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        All classes
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code}</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{cls.courses?.title}</h1>
      <p className="mt-3 text-muted-foreground">
        {cls.term}
        {cls.section ? ` · ${cls.section}` : ""}
        {cls.meeting_schedule ? ` · ${cls.meeting_schedule}` : ""}
        {cls.teacher_directory ? ` · ${cls.teacher_directory.full_name}` : ""}
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href={`/gradebook/${classId}/attendance`}>
            <ClipboardCheck className="mr-1.5 h-4 w-4" />
            Take the register
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/gradebook/${classId}/setup`}>
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            Scheme &amp; work
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <Badge key={g.id} variant="secondary">
            {g.name} {g.weight}%{g.source === "attendance" ? " · from register" : ""}
          </Badge>
        ))}
        {weightTotal !== 100 ? (
          <span className="text-sm font-medium text-destructive">
            Weights total {weightTotal}%, not 100%
          </span>
        ) : null}
      </div>

      <GradebookGrid
        classId={classId}
        groups={groups}
        students={students}
        passingScore={Number(cls.passing_score)}
        showVerdict={cls.status === "completed"}
      />
    </div>
  );
}
