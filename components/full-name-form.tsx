"use client";

import { useActionState } from "react";
import { saveMyName, type NameState } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "What's your full name?" — shown only to somebody whose record is missing
 * a first or last name, in the portal and before paying for a class.
 *
 * Once it saves, the page re-renders without it: the caller only draws this
 * while `needsFullName` is true.
 */
export function FullNameForm({
  firstName,
  lastName,
  intro = "It's printed on your certificate, so please write it as you'd like it to appear.",
}: {
  firstName: string;
  lastName: string;
  intro?: string;
}) {
  const [state, action, pending] = useActionState<NameState, FormData>(saveMyName, null);

  return (
    <form
      action={action}
      className="mt-8 rounded-lg border border-gold/50 bg-card p-6 shadow-card"
    >
      <h2 className="font-display text-2xl text-primary">What&rsquo;s your full name?</h2>
      <p className="mt-1.5 text-sm text-foreground/75">{intro}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">First name</span>
          <Input name="firstName" defaultValue={firstName} autoComplete="given-name" required />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Last name</span>
          <Input
            name="lastName"
            defaultValue={lastName}
            autoComplete="family-name"
            required
            // The one they are here to fill in.
            autoFocus={Boolean(firstName)}
          />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} className="bg-primary hover:bg-primary-deep">
          {pending ? "Saving…" : "Save my name"}
        </Button>
        {state?.error ? <span className="text-sm text-destructive">{state.error}</span> : null}
        {state?.ok ? <span className="text-sm text-primary">{state.ok}</span> : null}
      </div>
    </form>
  );
}
