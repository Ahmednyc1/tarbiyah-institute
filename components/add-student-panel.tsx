"use client";

import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  enrollExistingPerson,
  enrollNewPerson,
  type RosterState,
} from "@/app/admin/classes/[classId]/actions";

export function AddStudentPanel({
  classId,
  search,
  candidates,
  isFull,
}: {
  classId: string;
  search: string;
  candidates: { id: string; label: string; detail: string }[];
  isFull: boolean;
}) {
  const [showNew, setShowNew] = useState(false);
  const [existingState, enrolExisting, enrolPending] = useActionState<RosterState, FormData>(
    enrollExistingPerson,
    null,
  );
  const [newState, createAndEnrol, createPending] = useActionState<RosterState, FormData>(
    enrollNewPerson,
    null,
  );

  const message = existingState ?? newState;

  return (
    <div className="mt-5 rounded-lg border border-border bg-card p-6 shadow-card">
      {isFull ? (
        <p className="mb-5 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          This class is full. The database will refuse another enrolment until someone is dropped
          or the capacity is raised.
        </p>
      ) : null}

      {search.length >= 2 ? (
        candidates.length > 0 ? (
          <ul className="divide-y divide-border/60">
            {candidates.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <span className="font-medium text-foreground">{person.label}</span>
                  <span className="block text-xs text-muted-foreground">{person.detail}</span>
                </div>
                <form action={enrolExisting}>
                  <input type="hidden" name="classId" value={classId} />
                  <input type="hidden" name="personId" value={person.id} />
                  <Button type="submit" size="sm" disabled={enrolPending || isFull}>
                    Enrol
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody matching &ldquo;{search}&rdquo; who isn&apos;t already on this roster.
          </p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">
          Search above to find someone who already has a record — including anyone who has signed
          in but never taken a class.
        </p>
      )}

      <div className="mt-5 border-t border-border pt-5">
        {showNew ? (
          <form action={createAndEnrol} className="space-y-4">
            <input type="hidden" name="classId" value={classId} />

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                name="firstName"
                label="First name"
                required
                defaultValue={newState?.values?.firstName}
              />
              <Field
                name="lastName"
                label="Last name"
                required
                defaultValue={newState?.values?.lastName}
              />
              <Field
                name="email"
                label="Email (optional)"
                type="email"
                defaultValue={newState?.values?.email}
              />
              <Field name="phone" label="Phone (optional)" defaultValue={newState?.values?.phone} />
            </div>

            {newState?.emailWarning ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
              >
                <p>{newState.emailWarning}</p>
                <Button
                  type="submit"
                  name="confirmEmail"
                  value="1"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                >
                  The address is right — add anyway
                </Button>
              </div>
            ) : null}

            <p className="text-sm text-muted-foreground">
              An email is worth asking for even if they never sign in — if they later create an
              account with it, this record is claimed rather than duplicated.
            </p>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={createPending || isFull}
                className="bg-primary hover:bg-primary-deep"
              >
                {createPending ? "Adding…" : "Add and enrol"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button type="button" variant="outline" onClick={() => setShowNew(true)}>
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add someone new
          </Button>
        )}
      </div>

      {message?.error && !message?.emailWarning ? (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {message.error}
        </p>
      ) : null}
      {message?.ok ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {message.ok}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  defaultValue,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {/* key forces a remount when the echoed value changes, so the field
          actually repopulates after React resets the form. */}
      <Input
        key={defaultValue ?? ""}
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
      />
    </div>
  );
}
