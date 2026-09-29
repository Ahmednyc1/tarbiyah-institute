"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { saveRegister, type RegisterState } from "@/app/gradebook/[classId]/attendance/actions";
import { cn } from "@/lib/utils";

export type RegisterStudent = {
  enrollmentId: string;
  name: string;
  sortKey: string;
  studentNumber: string;
  /** Mark for the selected session, "" when not yet recorded. */
  current: string;
  /** session id -> status, for the history grid. */
  history: Record<string, string>;
};

export type RegisterSession = {
  id: string;
  number: number;
  meetsOn: string;
  title: string | null;
  isCancelled: boolean;
  marked: number;
};

const STATUSES = [
  { value: "present", label: "Present", short: "P" },
  { value: "late", label: "Late", short: "L" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "excused", label: "Excused", short: "E" },
] as const;

const shortOf = (status: string) => STATUSES.find((s) => s.value === status)?.short ?? "·";

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

export function AttendanceRegister({
  classId,
  sessions,
  selectedId,
  students,
}: {
  classId: string;
  sessions: RegisterSession[];
  selectedId: string | null;
  students: RegisterStudent[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RegisterState, FormData>(saveRegister, null);
  const selected = sessions.find((s) => s.id === selectedId) ?? null;

  if (students.length === 0) {
    return (
      <div className="mt-10 rounded-lg border border-border bg-card p-8 text-center shadow-card">
        <p className="text-foreground/75">Nobody is enrolled in this class yet.</p>
      </div>
    );
  }

  const alreadyTaken = (selected?.marked ?? 0) > 0;

  return (
    <>
      <form action={formAction} className="mt-8">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="sessionId" value={selected?.id ?? ""} />

        <div className="rounded-lg border border-border bg-card p-6 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <label htmlFor="sessionPicker" className="text-sm font-medium">
                Session
              </label>
              {/* A list, not a date field. A typo used to invent a meeting
                  that existed for one student and lowered their grade. */}
              <select
                id="sessionPicker"
                value={selected?.id ?? ""}
                onChange={(event) => {
                  router.push(`/gradebook/${classId}/attendance?session=${event.target.value}`);
                }}
                className="block h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.number}. {formatDate(s.meetsOn)}
                    {s.title ? ` — ${s.title}` : ""}
                    {s.isCancelled ? " (cancelled)" : s.marked > 0 ? " ✓" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Mark everyone</span>
              {STATUSES.map((status) => (
                <Button
                  key={status.value}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    for (const student of students) {
                      const input = document.querySelector<HTMLInputElement>(
                        `input[name="a:${student.enrollmentId}"][value="${status.value}"]`,
                      );
                      if (input) input.checked = true;
                    }
                  }}
                >
                  {status.label}
                </Button>
              ))}
            </div>
          </div>

          {alreadyTaken ? (
            <p className="mt-4 text-sm text-muted-foreground">
              The register was already taken for this date. Saving will update it.
            </p>
          ) : null}

          <ul className="mt-6 divide-y divide-border/60">
            {students.map((student) => (
              <li
                key={student.enrollmentId}
                className="flex flex-wrap items-center justify-between gap-4 py-3"
              >
                <div>
                  <span className="block font-medium text-foreground">{student.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {student.studentNumber}
                  </span>
                </div>

                <fieldset className="flex flex-wrap gap-2">
                  <legend className="sr-only">Attendance for {student.name}</legend>
                  {STATUSES.map((status) => (
                    <label
                      key={status.value}
                      className={cn(
                        "cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm transition-colors",
                        "has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground",
                        "hover:bg-secondary",
                      )}
                    >
                      <input
                        type="radio"
                        name={`a:${student.enrollmentId}`}
                        value={status.value}
                        defaultChecked={student.current === status.value}
                        className="sr-only"
                      />
                      {status.label}
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
            {pending ? "Saving…" : "Save register"}
          </Button>
          {state?.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          {state?.saved ? (
            <p role="status" className="text-sm text-muted-foreground">
              Saved {state.saved} {state.saved === 1 ? "mark" : "marks"}. Attendance grades
              recalculated.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Excused sessions are removed from the calculation entirely. Late counts as half.
          </p>
        </div>
      </form>

      {sessions.length > 0 ? (
        <>
          <h2 className="mt-14 font-display text-3xl text-primary">Every session</h2>
          <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50">
                <tr className="border-b border-border">
                  <th className="sticky left-0 z-10 bg-secondary/50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Student
                  </th>
                  {sessions.map((session) => (
                    <th
                      key={session.id}
                      className="whitespace-nowrap border-l border-border px-3 py-3 text-center text-xs font-medium text-muted-foreground"
                    >
                      <span className={session.isCancelled ? "line-through" : undefined}>
                        {session.number}
                      </span>
                      <span className="block font-normal">{formatDate(session.meetsOn)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.enrollmentId} className="border-b border-border/60 last:border-0">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium text-foreground">
                      {student.name}
                    </td>
                    {sessions.map((session) => {
                      const status = student.history[session.id] ?? "";
                      return (
                        <td
                          key={session.id}
                          className="border-l border-border px-3 py-2 text-center"
                          // The letter is the information; colour only reinforces it.
                          title={
                            session.isCancelled
                              ? "Cancelled — not counted"
                              : status
                                ? `${STATUSES.find((s) => s.value === status)?.label} on ${session.meetsOn}`
                                : "Not recorded"
                          }
                        >
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded text-xs font-medium",
                              status === "present" && "bg-primary/10 text-primary",
                              status === "late" && "bg-gold/25 text-gold-foreground",
                              status === "absent" && "bg-destructive/15 text-destructive",
                              status === "excused" && "bg-secondary text-muted-foreground",
                              !status && "text-muted-foreground",
                            )}
                          >
                            {status ? shortOf(status) : "·"}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            P present · L late · A absent · E excused · · not recorded. A struck-through
            number is a cancelled session, counted against nobody.
          </p>
        </>
      ) : null}
    </>
  );
}
