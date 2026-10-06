import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { confirmAddress, type ConfirmOutcome } from "@/lib/emails/confirm-address";

export const metadata: Metadata = { title: "Confirm your email" };

/**
 * Where a confirmation link lands.
 *
 * Deliberately public — no sign-in. The whole point is to reach somebody who
 * may have no account at all, registered at the desk by an admin who typed
 * their address.
 *
 * The outcome decides the wording, and none of these are errors in the system:
 * an expired link and a stranger's mistyped address are both ordinary things
 * that need different sentences.
 */

const WORDING: Record<ConfirmOutcome, { title: string; body: string; tone: "good" | "warn" }> = {
  confirmed: {
    title: "Thank you — that's confirmed",
    body: "We can reach you now. Your course details are on their way to this address, and class notices, marks and reminders will arrive here through the term.",
    tone: "good",
  },
  already: {
    title: "Already confirmed",
    body: "This address was confirmed earlier, so there is nothing more to do. You should have had an email with your course details.",
    tone: "good",
  },
  expired: {
    title: "That link has expired",
    body: "Confirmation links last 24 hours. Ask at the institute desk and they will send you another one — your place on the course is not affected.",
    tone: "warn",
  },
  changed: {
    title: "That link is out of date",
    body: "The address on file has been changed since this was sent, so this link no longer proves anything. A new one should have gone to the corrected address.",
    tone: "warn",
  },
  unknown: {
    title: "We don't recognise that link",
    body: "It may have been superseded by a newer one, or copied incompletely from the email. Try the most recent message, or ask at the institute desk.",
    tone: "warn",
  },
  error: {
    title: "Something went wrong at our end",
    body: "This is our problem rather than yours. Please try again in a few minutes, or let the institute know.",
    tone: "warn",
  },
};

export default async function ConfirmPage({ params }: PageProps<"/confirm/[token]">) {
  const { token } = await params;
  const outcome = await confirmAddress(token);
  const { title, body, tone } = WORDING[outcome];
  const Icon = tone === "good" ? CheckCircle2 : outcome === "expired" ? Clock : XCircle;

  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <p className="eyebrow">MAS Tarbiya Institute</p>
      <div className="gold-rule mt-3" />

      <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Icon
            className={tone === "good" ? "h-7 w-7 text-primary" : "h-7 w-7 text-destructive"}
          />
          <h1 className="font-display text-3xl text-primary">{title}</h1>
        </div>
        <p className="mt-4 leading-relaxed text-foreground/80">{body}</p>

        {outcome === "confirmed" || outcome === "already" ? (
          <>
            {/* Almost everybody who reaches this page was enrolled at the desk
                and has no account at all, so "go to your portal" would send
                them to a sign-in screen they were not expecting. Offer the
                thing that actually helps: signing in with this same address
                attaches the record the institute already holds for them. */}
            <p className="mt-4 text-sm text-muted-foreground">
              You don&apos;t need an account for any of that &mdash; it comes to you by email. But
              if you sign in with <strong>this same address</strong>, your marks, attendance and
              certificate appear online as the term runs, and the record the institute already
              holds for you is picked up automatically.
            </p>
            <Button asChild className="mt-5 bg-primary hover:bg-primary-deep">
              <Link href="/auth">Sign in with this address</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline" className="mt-5">
            <Link href="/courses">See the courses</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
