"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveGrades, type SaveState } from "@/app/gradebook/[classId]/actions";
import { cn } from "@/lib/utils";

export type Column = {
  id: string;
  name: string;
  maxScore: number;
  isPublished: boolean;
};

export type CategoryGroup = {
  id: string;
  name: string;
  weight: number;
  source: "assignments" | "attendance";
  columns: Column[];
};

export type StudentRow = {
  enrollmentId: string;
  name: string;
  sortKey: string;
  studentNumber: string;
  status: string;
  currentScore: number | null;
  weightGraded: number;
  /** assignment id -> current value, "" when unmarked */
  scores: Record<string, string>;
  /** attendance category id -> computed percentage */
  computed: Record<string, number | null>;
};

export function GradebookGrid({
  classId,
  groups,
  students,
  passingScore,
  showVerdict,
}: {
  classId: string;
  groups: CategoryGroup[];
  students: StudentRow[];
  passingScore: number;
  showVerdict: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(saveGrades, null);

  if (students.length === 0) {
    return (
      <div className="mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-card">
        <p className="text-foreground/75">Nobody is enrolled in this class yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          The grid appears once students have registered.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-8">
      <input type="hidden" name="classId" value={classId} />

      <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead>
            {/* Two header rows: categories spanning their assignments, then the
                assignments themselves. */}
            <tr className="bg-secondary/50">
              <Th sticky>Student</Th>
              {groups.map((g) => (
                <th
                  key={g.id}
                  colSpan={Math.max(1, g.source === "attendance" ? 1 : g.columns.length)}
                  className="border-l border-border px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {g.name} · {g.weight}%
                </th>
              ))}
              <th className="border-l border-border px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Grade
              </th>
            </tr>
            <tr className="border-b border-border bg-secondary/30">
              <Th sticky />
              {groups.flatMap((g) =>
                g.source === "attendance"
                  ? [
                      <th
                        key={g.id}
                        className="border-l border-border px-4 py-2 text-left text-xs font-normal text-muted-foreground"
                      >
                        From register
                      </th>,
                    ]
                  : g.columns.length === 0
                    ? [
                        <th
                          key={`${g.id}-empty`}
                          className="border-l border-border px-4 py-2 text-left text-xs font-normal italic text-muted-foreground"
                        >
                          No assignments
                        </th>,
                      ]
                    : g.columns.map((col) => (
                        <th
                          key={col.id}
                          className="border-l border-border px-4 py-2 text-left text-xs font-normal text-muted-foreground"
                        >
                          <span className="block whitespace-nowrap text-foreground/80">
                            {col.name}
                          </span>
                          <span className="block">
                            out of {col.maxScore}
                            {!col.isPublished ? " · draft" : ""}
                          </span>
                        </th>
                      )),
              )}
              <th className="border-l border-border px-4 py-2" />
            </tr>
          </thead>

          <tbody>
            {students.map((student) => (
              <tr key={student.enrollmentId} className="border-b border-border/60 last:border-0">
                <Td sticky>
                  <Link
                    href={`/gradebook/${classId}/student/${student.enrollmentId}`}
                    className="block whitespace-nowrap font-medium text-foreground underline-offset-4 hover:text-primary hover:underline"
                  >
                    {student.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {student.studentNumber}
                    {student.status !== "enrolled" ? ` · ${student.status}` : ""}
                  </span>
                </Td>

                {groups.flatMap((g) =>
                  g.source === "attendance"
                    ? [
                        <td
                          key={g.id}
                          className="border-l border-border px-4 py-2 lining-nums tabular-nums text-foreground/70"
                        >
                          {student.computed[g.id] === null
                            ? "—"
                            : `${student.computed[g.id]!.toFixed(0)}%`}
                        </td>,
                      ]
                    : g.columns.length === 0
                      ? [<td key={`${g.id}-empty`} className="border-l border-border px-4 py-2" />]
                      : g.columns.map((col) => (
                          <td key={col.id} className="border-l border-border px-2 py-2">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              max={col.maxScore}
                              name={`s:${student.enrollmentId}:${col.id}`}
                              defaultValue={student.scores[col.id] ?? ""}
                              aria-label={`${col.name} for ${student.name}`}
                              className="h-9 w-20 rounded-md border border-input bg-background px-2 text-right lining-nums tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            />
                          </td>
                        )),
                )}

                <Td>
                  {student.currentScore === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <span className="font-medium lining-nums tabular-nums text-foreground">
                        {student.currentScore}%
                      </span>
                      {showVerdict ? (
                        <Badge
                          variant={
                            student.currentScore >= passingScore ? "default" : "destructive"
                          }
                        >
                          {student.currentScore >= passingScore ? "Pass" : "Fail"}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          of {student.weightGraded}% marked
                        </span>
                      )}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
          {pending ? "Saving…" : "Save marks"}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state?.saved !== undefined && !state.error ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saved. Grades recalculated.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Leave a box empty for work not yet marked — that is different from a zero, and only a
          zero counts against the average.
        </p>
      </div>
    </form>
  );
}

function Th({ children, sticky }: { children?: React.ReactNode; sticky?: boolean }) {
  return (
    <th
      className={cn(
        "px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
        // Keeps the name visible while scrolling a wide grid sideways.
        sticky && "sticky left-0 z-10 bg-secondary/50",
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, sticky }: { children?: React.ReactNode; sticky?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-2 align-middle text-foreground/80",
        sticky ? "sticky left-0 z-10 bg-card" : "border-l border-border",
      )}
    >
      {children}
    </td>
  );
}
