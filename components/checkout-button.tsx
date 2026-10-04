"use client";

import { useActionState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startCheckout, type CheckoutState } from "@/app/register/[classId]/actions";

/**
 * Sends the student to Stripe.
 *
 * The action redirects on success, so this form has a return channel only for
 * failure — "the class is full", "you are already enrolled". Those sentences
 * come from `hold_seat` in the database, which is where the rules live.
 */
export function CheckoutButton({ classId, fee }: { classId: string; fee: string }) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(startCheckout, null);

  return (
    <form action={action}>
      <input type="hidden" name="classId" value={classId} />

      <Button
        type="submit"
        disabled={pending}
        className="mt-5 w-full bg-primary hover:bg-primary-deep sm:w-auto"
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Taking you to checkout…
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Pay {fee} and register
          </>
        )}
      </Button>

      {state?.error ? <p className="mt-3 text-sm text-destructive">{state.error}</p> : null}

      <p className="mt-3 text-xs text-muted-foreground">
        Your seat is held for 40 minutes while you pay. Card details go straight to Stripe — they
        never touch our servers.
      </p>
    </form>
  );
}
