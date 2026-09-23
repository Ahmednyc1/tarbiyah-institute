import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatFee } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Admin",
  description: "Institute overview.",
};

type ClassRow = {
  id: string;
  term: string;
  section: string | null;
  status: string;
  capacity: number | null;
  registration_fee: number;
  meeting_schedule: string | null;
  courses: { code: string; title: string } | null;
  teacher_directory: { full_name: string } | null;
  enrollments: { count: number }[];
  grade_categories: { weight: number }[];
};

export default async function AdminPage() {
  const supabase = await createClient();

  const [coursesRes, studentsRes, classesRes, enrollmentsRes] = await Promise.all([
    supabase.from("courses").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("students").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase
      .from("classes")
      .select(
        `id, term, section, status, capacity, registration_fee, meeting_schedule,
         courses ( code, title ),
         teacher_directory ( full_name ),
         enrollments ( count ),
         grade_categories ( weight )`,
      )
      .order("term"),
    // Small by nature — one masjid, a few hundred rows at most. Summing in JS
    // keeps this to one round trip instead of several aggregate queries.
    supabase.from("enrollments").select("amount_due, amount_paid, status"),
  ]);

  const classes = (classesRes.data ?? []) as unknown as ClassRow[];
  const enrollments = enrollmentsRes.data ?? [];

  const outstanding = enrollments
    .filter((e) => e.status !== "dropped")
    .reduce((sum, e) => sum + Math.max(0, Number(e.amount_due) - Number(e.amount_paid)), 0);

  const openClasses = classes.filter((c) => c.status === "open" || c.status === "in_progress");

  const stats = [
    { label: "Active courses", value: String(coursesRes.count ?? 0) },
    { label: "Classes running", value: String(openClasses.length) },
    { label: "Students", value: String(studentsRes.count ?? 0) },
    { label: "Outstanding", value: formatFee(outstanding) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <p className="eyebrow">Administration</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">Institute overview</h1>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-card p-5 shadow-card"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {stat.label}
            </p>
            {/* Cormorant defaults to oldstyle figures, where 1 and 0 read as
                I and O. Force lining figures for anything numeric. */}
            <p className="mt-2 font-display text-4xl leading-none text-primary lining-nums tabular-nums">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mt-14 font-display text-3xl text-primary">Classes</h2>

      {classes.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No classes yet.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-secondary/50">
              <tr className="border-b border-border">
                {/* width:100% on the first column makes it absorb all the
                    slack, so the remaining columns hug their content instead of
                    drifting apart across the full width. */}
                <Th className="w-full">Course</Th>
                <Th>Term</Th>
                <Th>Teacher</Th>
                <Th>Status</Th>
                {/* Left, like every other column. The "numbers go right"
                    convention pays off when there is a tall column of figures
                    to scan down; with a handful of classes it just breaks the
                    rhythm. tabular-nums still keeps the digits in line. */}
                <Th>Enrolled</Th>
                <Th>Fee</Th>
                <Th>Grading</Th>
              </tr>
            </thead>
            <tbody>
              {classes.map((row) => {
                const enrolled = row.enrollments[0]?.count ?? 0;
                const weights = row.grade_categories.reduce((s, g) => s + Number(g.weight), 0);
                const schemeReady = weights === 100;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30"
                  >
                    <Td>
                      <Link
                        href={`/gradebook/${row.id}`}
                        className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                      >
                        {row.courses?.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {row.courses?.code} ·{" "}
                        {/* Visibly a link. Styled like the surrounding muted
                            text, it read as part of the subtitle and nobody
                            could tell it was clickable. */}
                        <Link
                          href={`/admin/classes/${row.id}`}
                          className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
                        >
                          Manage roster
                        </Link>
                      </span>
                    </Td>
                    <Td>
                      {row.term}
                      {row.section ? ` · ${row.section}` : ""}
                    </Td>
                    <Td>{row.teacher_directory?.full_name ?? "—"}</Td>
                    <Td>
                      <Badge
                        variant={row.status === "open" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {row.status.replace("_", " ")}
                      </Badge>
                    </Td>
                    <Td numeric>
                      {enrolled}
                      {row.capacity !== null ? ` / ${row.capacity}` : ""}
                    </Td>
                    <Td numeric>{formatFee(Number(row.registration_fee))}</Td>
                    <Td>
                      {/* Labelled, not colour-only — this has to be readable in
                          greyscale and to a colourblind reader. */}
                      {schemeReady ? (
                        <span className="text-muted-foreground">Set</span>
                      ) : (
                        <span className="font-medium text-destructive">
                          Incomplete ({weights}%)
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <Button asChild variant="outline">
          <Link href="/admin/courses">Courses and classes</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          Create a course, schedule a class, or open a roster to enrol students.
        </p>
      </div>
    </div>
  );
}

// `th` has a UA default of text-align:center that beats the inherited value,
// so alignment has to be set explicitly on every header cell.
function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  numeric = false,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  numeric?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-4 align-middle text-foreground/80",
        align === "right" ? "text-right" : "text-left",
        // Lining figures so digits don't read as letters, tabular so columns
        // of numbers line up.
        numeric && "lining-nums tabular-nums",
      )}
    >
      {children}
    </td>
  );
}
