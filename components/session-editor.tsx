"use client";

import { useActionState, useState } from "react";
import { CalendarPlus, CircleSlash, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearSessions,
  generateSessions,
  saveSession,
  type SessionState,
} from "@/app/gradebook/[classId]/sessions/actions";

export type SessionRecord = {
  id: string;
  number: number;
  meetsOn: string;
  startsAt: string | null;
  title: string | null;
  summary: string | null;
  recordingUrl: string | null;
  isCancelled: boolean;
  isPublished: boolean;
  marked: number;
};

const inputClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export const formatSessionDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function GenerateSessions({ classId, startDate }: { classId: string; startDate: string | null }) {
  const [state, action, pending] = useActionState<SessionState, FormData>(generateSessions, null);

  return (
    <form action={action} className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h2 className="font-display text-2xl text-primary">Lay out the term</h2>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Most classes meet weekly. Set the first date and how many times it runs, then edit any
        individual session afterwards — a date can move, and a week can be cancelled.
      </p>

      <input type="hidden" name="classId" value={classId} />

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Labelled label="First session">
          {/* Prefilled from the class start date, which is usually the answer. */}
          <Input name="first" type="date" defaultValue={startDate ?? ""} required />
        </Labelled>
        <Labelled label="How many">
          <Input name="count" type="number" min={1} max={52} defaultValue={8} required />
        </Labelled>
        <Labelled label="Days apart">
          <select name="everyDays" defaultValue="7" className={inputClass}>
            <option value="7">Weekly</option>
            <option value="14">Fortnightly</option>
            <option value="1">Daily</option>
          </select>
        </Labelled>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
          <CalendarPlus className="mr-1.5 h-4 w-4" />
          {pending ? "Laying out…" : "Generate sessions"}
        </Button>
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {state?.ok ? <p className="text-sm text-primary">{state.ok}</p> : null}
      </div>
    </form>
  );
}

export function SessionCard({ classId, session }: { classId: string; session: SessionRecord }) {
  const [state, action, pending] = useActionState<SessionState, FormData>(saveSession, null);
  const [open, setOpen] = useState(false);

  return (
    <li
      className={`rounded-lg border border-border bg-card p-5 shadow-card ${
        session.isCancelled ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium text-foreground">
            <span className="text-muted-foreground">{session.number}.</span>{" "}
            {session.title ?? <span className="text-muted-foreground">Untitled</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatSessionDate(session.meetsOn)}
            {session.startsAt ? ` · ${session.startsAt.slice(0, 5)}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {session.isCancelled ? (
            <Badge variant="destructive">
              <CircleSlash className="mr-1 h-3 w-3" />
              Cancelled
            </Badge>
          ) : null}
          {session.recordingUrl ? (
            <Badge variant="secondary">
              <Video className="mr-1 h-3 w-3" />
              Recording
            </Badge>
          ) : null}
          {session.isPublished ? (
            <Badge variant="default">Visible to students</Badge>
          ) : (
            <Badge variant="outline">Draft</Badge>
          )}
          {session.marked > 0 ? (
            <span className="text-xs text-muted-foreground">
              {session.marked} marked
            </span>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {open ? (
        <form action={action} className="mt-5 space-y-4 border-t border-border pt-5">
          <input type="hidden" name="classId" value={classId} />
          <input type="hidden" name="sessionId" value={session.id} />

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem_8rem]">
            <Labelled label="Title">
              <Input name="title" defaultValue={session.title ?? ""} placeholder="The Seven Ahruf" />
            </Labelled>
            <Labelled label="Date">
              <Input name="meetsOn" type="date" defaultValue={session.meetsOn} required />
            </Labelled>
            <Labelled label="Starts">
              <Input name="startsAt" type="time" defaultValue={session.startsAt?.slice(0, 5) ?? ""} />
            </Labelled>
          </div>

          <Labelled label="Recording">
            <Input
              name="recordingUrl"
              type="url"
              defaultValue={session.recordingUrl ?? ""}
              placeholder="https://youtu.be/…"
            />
          </Labelled>

          <Labelled label="What was covered">
            <textarea
              name="summary"
              defaultValue={session.summary ?? ""}
              rows={3}
              className={inputClass.replace("h-9", "min-h-20 py-2")}
            />
          </Labelled>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isCancelled"
                defaultChecked={session.isCancelled}
                className="h-4 w-4 rounded border-input"
              />
              <span>Cancelled — not counted against anyone&rsquo;s attendance</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="isPublished"
                defaultChecked={session.isPublished}
                className="h-4 w-4 rounded border-input"
              />
              <span>Visible to students</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="sm" disabled={pending} className="bg-primary hover:bg-primary-deep">
              {pending ? "Saving…" : "Save"}
            </Button>
            {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
            {state?.ok ? <p className="text-sm text-primary">{state.ok}</p> : null}
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function ClearSessions({ classId, anyMarked }: { classId: string; anyMarked: boolean }) {
  if (anyMarked) {
    return (
      <p className="text-sm text-muted-foreground">
        The term cannot be laid out again — a register has already been taken. Edit the
        individual sessions instead, or cancel the ones that did not run.
      </p>
    );
  }

  return (
    <form action={clearSessions} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="classId" value={classId} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
        Remove all sessions
      </Button>
      <span className="text-sm text-muted-foreground">
        Only while no register has been taken. Lets you lay the term out again.
      </span>
    </form>
  );
}
