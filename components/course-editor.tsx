"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteCourse,
  saveCourse,
  setCourseStatus,
  type CatalogueState,
} from "@/app/admin/courses/actions";
import { formatFee } from "@/lib/format";

export type TeacherOption = { id: string; name: string };

/**
 * A course as the institute thinks of it — one subject, one run.
 *
 * The database keeps `courses` and `classes` apart so a repeat could have its
 * own roster, but this institute names a repeat separately ("Fiqh of Fasting
 * 2"), so the two are presented as a single thing. `classId` is carried through
 * silently because everything else — rosters, grades, attendance — hangs off it.
 */
export type CourseRecord = {
  id: string;
  classId: string | null;
  code: string;
  title: string;
  description: string | null;
  isActive: boolean;
  term: string;
  teacherId: string | null;
  status: string;
  fee: number;
  capacity: number | null;
  schedule: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  enrolled: number;
  weightTotal: number;
};

const STATUSES = ["draft", "open", "in_progress", "completed", "cancelled"] as const;

export function CourseCardEditor({
  course,
  teachers,
}: {
  course: CourseRecord;
  teachers: TeacherOption[];
}) {
  const [editing, setEditing] = useState(false);
  const [saveState, save, saving] = useActionState<CatalogueState, FormData>(saveCourse, null);
  const [statusState, changeStatus, changing] = useActionState<CatalogueState, FormData>(
    setCourseStatus,
    null,
  );
  const [deleteState, remove, removing] = useActionState<CatalogueState, FormData>(
    deleteCourse,
    null,
  );

  const schemeReady = course.weightTotal === 100;
  const setUp = course.classId !== null;

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-2xl text-primary">{course.title}</h3>
            <Badge variant="secondary">{course.code}</Badge>
            <Badge
              variant={course.status === "open" ? "default" : "secondary"}
              className="capitalize"
            >
              {setUp ? course.status.replace("_", " ") : "not set up"}
            </Badge>
            {!course.isActive ? <Badge variant="outline">Hidden</Badge> : null}
            {setUp && !schemeReady ? (
              <Badge variant="destructive">Grading {course.weightTotal}%</Badge>
            ) : null}
          </div>

          {setUp ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              {course.term}
              {course.schedule ? ` · ${course.schedule}` : ""} · {formatFee(course.fee)} ·{" "}
              {course.enrolled}
              {course.capacity !== null ? ` / ${course.capacity}` : ""} enrolled
            </p>
          ) : null}

          {course.description ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground/75">
              {course.description}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {setUp ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/classes/${course.classId}`}>Roster</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/gradebook/${course.classId}/setup`}>Grading</Link>
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            variant={setUp ? "ghost" : "default"}
            size="sm"
            className={setUp ? undefined : "bg-gold text-gold-foreground hover:bg-gold/90"}
            onClick={() => setEditing(!editing)}
          >
            {editing ? "Close" : setUp ? "Edit" : "Finish setting up"}
          </Button>
        </div>
      </div>

      {setUp && !schemeReady && course.status === "draft" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Set a grading scheme totalling 100% before publishing — the database will refuse
          otherwise.
        </p>
      ) : null}

      {editing ? (
        <form action={save} className="mt-5 space-y-5 border-t border-border pt-5">
          <input type="hidden" name="courseId" value={course.id} />
          {course.classId ? <input type="hidden" name="classId" value={course.classId} /> : null}
          <CourseFields teachers={teachers} course={course} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="bg-primary hover:bg-primary-deep"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
            <Message state={saveState} />
          </div>
        </form>
      ) : null}

      {setUp ? (
        <form
          action={changeStatus}
          className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-5"
        >
          <input type="hidden" name="classId" value={course.classId ?? ""} />
          <label className="text-xs uppercase tracking-wider text-muted-foreground">Status</label>
          <select
            name="status"
            // Remount when the status changes — defaultValue is read once, so
            // the select otherwise keeps showing the value it started with.
            key={course.status}
            defaultValue={course.status}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm capitalize shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <Button type="submit" size="sm" variant="outline" disabled={changing}>
            {changing ? "Updating…" : "Update"}
          </Button>
          <Message state={statusState} />
        </form>
      ) : null}

      {course.enrolled === 0 ? (
        <form action={remove} className="mt-4 flex flex-wrap items-center gap-3">
          <input type="hidden" name="courseId" value={course.id} />
          <Button
            type="submit"
            size="sm"
            variant="ghost"
            disabled={removing}
            className="text-destructive hover:bg-destructive/10"
          >
            {removing ? "Deleting…" : "Delete this course"}
          </Button>
          <span className="text-xs text-muted-foreground">
            Nobody has enrolled, so nothing is lost. Once somebody has, cancel it instead.
          </span>
          <Message state={deleteState} />
        </form>
      ) : null}
    </section>
  );
}

export function NewCourseForm({ teachers }: { teachers: TeacherOption[] }) {
  const [show, setShow] = useState(false);
  const [state, save, pending] = useActionState<CatalogueState, FormData>(saveCourse, null);

  if (!show) {
    return (
      <Button type="button" onClick={() => setShow(true)} className="bg-primary hover:bg-primary-deep">
        Add a course
      </Button>
    );
  }

  return (
    <form action={save} className="space-y-5 rounded-lg border border-border bg-card p-6 shadow-card">
      <CourseFields teachers={teachers} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
          {pending ? "Creating…" : "Create course"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setShow(false)}>
          Cancel
        </Button>
        <Message state={state} />
      </div>
    </form>
  );
}

function CourseFields({
  teachers,
  course,
}: {
  teachers: TeacherOption[];
  course?: CourseRecord;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Labelled label="Code">
          <Input name="code" defaultValue={course?.code} placeholder="FQH-201" required />
        </Labelled>
        <Labelled label="Title">
          <Input
            name="title"
            defaultValue={course?.title}
            placeholder="Fiqh of Transactions"
            required
          />
        </Labelled>
      </div>

      <Labelled label="Description">
        <textarea
          name="description"
          rows={3}
          defaultValue={course?.description ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </Labelled>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Labelled label="Teacher">
          <select
            name="teacherId"
            defaultValue={course?.teacherId ?? ""}
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="" disabled>
              Choose…
            </option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Term" hint="Fall 2026, Ramadan 1448">
          <Input name="term" defaultValue={course?.term} required />
        </Labelled>
        <Labelled label="Tuition">
          <Input
            name="fee"
            type="number"
            min={0}
            step="0.01"
            defaultValue={course?.fee ?? 0}
            required
            className="lining-nums tabular-nums"
          />
        </Labelled>
        <Labelled label="Seats" hint="blank for no limit">
          <Input
            name="capacity"
            type="number"
            min={1}
            step={1}
            defaultValue={course?.capacity ?? ""}
            className="lining-nums tabular-nums"
          />
        </Labelled>
        <Labelled label="Schedule" hint="Sundays 10:00 AM–12:30 PM">
          <Input name="schedule" defaultValue={course?.schedule ?? ""} />
        </Labelled>
        <Labelled label="Location">
          <Input name="location" defaultValue={course?.location ?? ""} />
        </Labelled>
        <Labelled label="Starts">
          <Input name="startDate" type="date" defaultValue={course?.startDate ?? ""} />
        </Labelled>
        <Labelled label="Ends">
          <Input name="endDate" type="date" defaultValue={course?.endDate ?? ""} />
        </Labelled>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={course?.isActive ?? true}
          className="accent-primary"
        />
        Listed on the public catalogue
      </label>
    </>
  );
}

function Labelled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Message({ state }: { state: CatalogueState }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  if (state?.ok) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {state.ok}
      </p>
    );
  }
  return null;
}
