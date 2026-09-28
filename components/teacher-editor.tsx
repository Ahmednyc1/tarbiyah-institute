"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { ImageOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  removeTeacherPhoto,
  saveTeacher,
  uploadTeacherPhoto,
  type TeacherState,
} from "@/app/admin/teachers/actions";

export type TeacherRecord = {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  bio: string | null;
  photoUrl: string | null;
  isActive: boolean;
  classCount: number;
  hasLogin: boolean;
};

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function Message({ state }: { state: TeacherState }) {
  if (!state) return null;
  return (
    <p className={state.error ? "text-sm text-destructive" : "text-sm text-primary"}>
      {state.error ?? state.ok}
    </p>
  );
}

/** The name and bio. Shared by the add form and each existing teacher. */
function Fields({ teacher }: { teacher?: TeacherRecord }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[6rem_1fr_1fr]">
        <Labelled label="Title">
          <Input name="title" defaultValue={teacher?.title ?? ""} placeholder="Sh" maxLength={20} />
        </Labelled>
        <Labelled label="First name">
          <Input name="firstName" defaultValue={teacher?.firstName ?? ""} required />
        </Labelled>
        <Labelled label="Last name">
          <Input name="lastName" defaultValue={teacher?.lastName ?? ""} required />
        </Labelled>
      </div>

      <Labelled
        label="Email"
        hint={
          teacher?.hasLogin
            ? "They have signed in with this address."
            : "They sign in with Google using this address and land in their own gradebook. Leaving it blank means they cannot sign in yet."
        }
      >
        <Input
          name="email"
          type="email"
          defaultValue={teacher?.email ?? ""}
          placeholder="name@masnewyork.org"
        />
      </Labelled>

      <Labelled label="Biography" hint="Shown on the course page. A few sentences.">
        <textarea
          name="bio"
          defaultValue={teacher?.bio ?? ""}
          rows={4}
          maxLength={2000}
          className={inputClass.replace("h-9", "min-h-24 py-2")}
        />
      </Labelled>
    </>
  );
}

export function NewTeacherForm() {
  const [state, action, pending] = useActionState<TeacherState, FormData>(saveTeacher, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-primary-deep">
        <UserRound className="mr-1.5 h-4 w-4" />
        Add a teacher
      </Button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-card"
    >
      <h2 className="font-display text-2xl text-primary">A new teacher</h2>
      <Fields />
      <input type="hidden" name="isActive" value="on" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
          {pending ? "Adding…" : "Add teacher"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Message state={state} />
      </div>
      <p className="text-xs text-muted-foreground">
        A photograph can be added once they exist.
      </p>
    </form>
  );
}

export function TeacherCard({ teacher }: { teacher: TeacherRecord }) {
  const [state, action, pending] = useActionState<TeacherState, FormData>(saveTeacher, null);
  const [photoState, photoAction, photoPending] = useActionState<TeacherState, FormData>(
    uploadTeacherPhoto,
    null,
  );
  const [open, setOpen] = useState(false);

  return (
    <li
      className={`rounded-lg border border-border bg-card p-5 shadow-card ${
        teacher.isActive ? "" : "opacity-60"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {teacher.photoUrl ? (
            <Image
              src={teacher.photoUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <UserRound className="h-7 w-7 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-medium text-foreground">
              {[teacher.title, teacher.firstName, teacher.lastName].filter(Boolean).join(" ")}
            </p>
            <p className="text-xs text-muted-foreground">
              {teacher.email ?? "No email — cannot sign in yet"}
              {teacher.hasLogin ? " · signs in" : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {teacher.classCount === 0
                ? "No courses yet"
                : `${teacher.classCount} ${teacher.classCount === 1 ? "course" : "courses"}`}
              {teacher.isActive ? "" : " · not shown on the site"}
            </p>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "Close" : "Edit"}
        </Button>
      </div>

      {open ? (
        <div className="mt-5 space-y-6 border-t border-border pt-5">
          <form action={action} className="space-y-4">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <Fields teacher={teacher} />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isActive"
                defaultChecked={teacher.isActive}
                className="h-4 w-4 rounded border-input"
              />
              <span>Shown on the site and available to teach</span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={pending} className="bg-primary hover:bg-primary-deep">
                {pending ? "Saving…" : "Save"}
              </Button>
              <Message state={state} />
            </div>

            {teacher.classCount > 0 ? (
              <p className="text-xs text-muted-foreground">
                Teachers are never deleted — {teacher.firstName} has {teacher.classCount}{" "}
                {teacher.classCount === 1 ? "course" : "courses"} whose marks belong to them.
                Unticking above removes them from the site and the course picker while keeping
                that history.
              </p>
            ) : null}
          </form>

          <div className="space-y-3 border-t border-border pt-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Photograph</p>
            <form action={photoAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="teacherId" value={teacher.id} />
              <input
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                required
                className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
              />
              <Button type="submit" size="sm" variant="outline" disabled={photoPending}>
                {photoPending ? "Uploading…" : "Upload"}
              </Button>
              {teacher.photoUrl ? (
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  formAction={removeTeacherPhoto}
                  formNoValidate
                  className="text-destructive hover:bg-destructive/10"
                >
                  <ImageOff className="mr-1.5 h-4 w-4" />
                  Remove
                </Button>
              ) : null}
            </form>
            <Message state={photoState} />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG or WebP, up to 5MB. Square images look best — it is shown as a circle.
            </p>
          </div>
        </div>
      ) : null}
    </li>
  );
}
