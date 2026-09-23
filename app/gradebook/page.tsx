import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getViewer } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Gradebook",
  description: "Classes you can grade.",
};

type Row = {
  id: string;
  term: string;
  section: string | null;
  status: string;
  meeting_schedule: string | null;
  courses: { code: string; title: string } | null;
  teacher_directory: { full_name: string } | null;
  enrollments: { count: number }[];
};

export default async function GradebookPage() {
  const viewer = await getViewer();
  const supabase = await createClient();

  // No teacher filter here on purpose. RLS already decides: a teacher sees the
  // classes they teach, an admin sees all of them. Filtering in the query too
  // would be a second, drifting definition of the same rule.
  const { data } = await supabase
    .from("classes")
    .select(
      `id, term, section, status, meeting_schedule,
       courses ( code, title ),
       teacher_directory ( full_name ),
       enrollments ( count )`,
    )
    .in("status", ["open", "in_progress", "completed"])
    .order("term", { ascending: false });

  const classes = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="eyebrow">Gradebook</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">
        {viewer?.isAdmin && viewer.teacherId === null ? "All classes" : "Your classes"}
      </h1>
      <p className="mt-4 text-lg text-foreground/75">
        Enter marks, take the register, and see where each student stands.
      </p>

      {classes.length === 0 ? (
        <div className="mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-card">
          <p className="text-foreground/75">
            You have no classes to grade. A class appears here once it is published.
          </p>
        </div>
      ) : (
        <ul className="mt-10 space-y-4">
          {classes.map((row) => (
            <li key={row.id}>
              <Link
                href={`/gradebook/${row.id}`}
                className="group flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-lift"
              >
                <div>
                  <h2 className="font-display text-2xl text-primary">{row.courses?.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {row.term}
                    {row.section ? ` · ${row.section}` : ""}
                    {row.meeting_schedule ? ` · ${row.meeting_schedule}` : ""}
                  </p>
                  <p className="mt-2 text-sm text-foreground/70">
                    {row.enrollments[0]?.count ?? 0} enrolled
                    {viewer?.isAdmin && row.teacher_directory
                      ? ` · ${row.teacher_directory.full_name}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge
                    variant={row.status === "completed" ? "secondary" : "default"}
                    className="capitalize"
                  >
                    {row.status.replace("_", " ")}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
