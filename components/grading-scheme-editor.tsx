"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveScheme, type SchemeState } from "@/app/gradebook/[classId]/setup/actions";
import { cn } from "@/lib/utils";

export type SchemeRow = {
  id: string | null;
  name: string;
  weight: number;
  source: "assignments" | "attendance";
  /** How much work is already filed under this category. */
  assignmentCount: number;
};

/** A starting point when a class has no scheme yet. Weights are a guess. */
const SUGGESTED: Omit<SchemeRow, "id" | "assignmentCount">[] = [
  { name: "Homework", weight: 20, source: "assignments" },
  { name: "Classwork", weight: 10, source: "assignments" },
  { name: "Quizzes", weight: 15, source: "assignments" },
  { name: "Exams", weight: 30, source: "assignments" },
  { name: "Participation", weight: 5, source: "assignments" },
  { name: "Attendance", weight: 20, source: "attendance" },
];

export function GradingSchemeEditor({
  classId,
  initial,
}: {
  classId: string;
  initial: SchemeRow[];
}) {
  const [rows, setRows] = useState<SchemeRow[]>(initial);
  const [state, formAction, pending] = useActionState<SchemeState, FormData>(saveScheme, null);

  const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0);
  const balanced = total === 100;

  // Categories present before but removed now — deleting them takes their
  // assignments and every mark against them.
  const removed = initial.filter((i) => !rows.some((r) => r.id === i.id));
  const marksAtRisk = removed.reduce((n, r) => n + r.assignmentCount, 0);

  const update = (index: number, patch: Partial<SchemeRow>) =>
    setRows(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="mt-6">
      <input type="hidden" name="classId" value={classId} />
      <input
        type="hidden"
        name="categories"
        value={JSON.stringify(
          rows.map((r, index) => ({
            id: r.id,
            name: r.name,
            weight: Number(r.weight),
            position: index,
            source: r.source,
          })),
        )}
      />

      <div className="rounded-lg border border-border bg-card shadow-card">
        <ul className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <li key={row.id ?? `new-${index}`} className="flex flex-wrap items-end gap-3 p-4">
              <div className="min-w-[12rem] flex-1 space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Category
                </label>
                <Input
                  value={row.name}
                  onChange={(e) => update(index, { name: e.target.value })}
                  placeholder="Homework"
                />
              </div>

              <div className="w-28 space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Weight %
                </label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  step="any"
                  value={row.weight}
                  onChange={(e) => update(index, { weight: Number(e.target.value) })}
                  className="lining-nums tabular-nums"
                />
              </div>

              <div className="w-48 space-y-1.5">
                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Scored from
                </label>
                <select
                  value={row.source}
                  onChange={(e) =>
                    update(index, { source: e.target.value as SchemeRow["source"] })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="assignments">Marked work</option>
                  <option value="attendance">The register</option>
                </select>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${row.name || "category"}`}
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRows([
                ...rows,
                { id: null, name: "", weight: 0, source: "assignments", assignmentCount: 0 },
              ])
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add category
          </Button>

          {rows.length === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setRows(SUGGESTED.map((s) => ({ ...s, id: null, assignmentCount: 0 })))
              }
            >
              Use the standard six
            </Button>
          ) : null}

          <p
            className={cn(
              "text-sm font-medium lining-nums tabular-nums",
              balanced ? "text-muted-foreground" : "text-destructive",
            )}
          >
            Total {total}% {balanced ? "" : "— must be exactly 100%"}
          </p>
        </div>
      </div>

      {marksAtRisk > 0 ? (
        <p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Removing {removed.map((r) => r.name).join(", ")} will also delete{" "}
          {marksAtRisk} {marksAtRisk === 1 ? "assignment" : "assignments"} and every mark recorded
          against {marksAtRisk === 1 ? "it" : "them"}. This cannot be undone.
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button
          type="submit"
          disabled={pending || !balanced}
          className="bg-primary hover:bg-primary-deep"
        >
          {pending ? "Saving…" : "Save scheme"}
        </Button>
        {state?.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        {state?.saved ? (
          <p role="status" className="text-sm text-muted-foreground">
            Scheme saved.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Saved all at once — a published class is never allowed to sit at a total other than 100%.
        </p>
      </div>
    </form>
  );
}
