import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Receipt, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/account";
import { formatMoney } from "@/lib/format";
import { stripeClient, stripeIsConfigured, toDollars } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Registration complete" };

/**
 * Where Stripe sends the student after they pay.
 *
 * The webhook is what makes an enrollment real, and it usually lands within a
 * second — but "usually" is not good enough for the person who has just been
 * charged and is looking at the screen. So this page redeems the hold itself
 * rather than waiting. `redeem_hold` returns the existing enrollment for a
 * hold already redeemed, so whichever of the two arrives second changes
 * nothing.
 *
 * It reaches for the service-role client to do that, which is only safe
 * because of the three checks below, in order: Stripe itself must say the
 * session is paid, the session must name this signed-in person, and the hold
 * must be one we issued. A session id in somebody else's hands proves nothing
 * and redeems nothing.
 */
export default async function ThanksPage({
  params,
  searchParams,
}: PageProps<"/register/[classId]/thanks">) {
  const { classId } = await params;
  const { session_id: sessionId } = await searchParams;

  const supabase = await createClient();
  const [{ data: cls }, viewer] = await Promise.all([
    supabase
      .from("classes")
      .select("id, term, meeting_schedule, courses ( code, title )")
      .eq("id", classId)
      .maybeSingle(),
    getViewer(),
  ]);

  if (!cls?.courses) notFound();

  const courseTitle = cls.courses.title;

  if (!viewer) {
    return (
      <Shell title="Please sign in" icon={Clock} tone="warn" course={courseTitle}>
        <p>
          Your payment may well have gone through — sign in and check your portal. If the course
          is not there in a few minutes, email the institute and quote your Stripe receipt.
        </p>
        <Button asChild className="mt-5 bg-primary hover:bg-primary-deep">
          <Link href={`/auth?next=/register/${classId}/thanks`}>Sign in</Link>
        </Button>
      </Shell>
    );
  }

  if (typeof sessionId !== "string" || !sessionId || !stripeIsConfigured()) {
    return (
      <Shell title="We could not find that payment" icon={XCircle} tone="warn" course={courseTitle}>
        <p>
          No Stripe session came back with this page. If you were charged, nothing is lost —
          email the institute and quote your receipt.
        </p>
        <PortalButton />
      </Shell>
    );
  }

  // The charge is expanded because it carries `receipt_url` — a page Stripe
  // hosts for every successful payment, whether or not a receipt email was
  // ever sent. Linking it is the only claim about receipts we can always make
  // honestly: emails depend on a dashboard setting, and Stripe sends none at
  // all for test payments.
  const session = await stripeClient()
    .checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] })
    .catch(() => null);

  if (!session || session.payment_status !== "paid") {
    return (
      <Shell title="Payment not completed" icon={XCircle} tone="warn" course={courseTitle}>
        <p>
          Stripe has not recorded a completed payment for this session. Your seat is still held
          for a short while, so you can try again.
        </p>
        <Button asChild variant="outline" className="mt-5">
          <Link href={`/register/${classId}`}>Back to registration</Link>
        </Button>
      </Shell>
    );
  }

  // The session must belong to the person reading this page. Without it, a
  // session id lifted from a URL would redeem somebody else's hold.
  if (session.metadata?.person_id && session.metadata.person_id !== viewer.personId) {
    return (
      <Shell title="That payment is not yours" icon={XCircle} tone="warn" course={courseTitle}>
        <p>This receipt belongs to a different account. Check which one you are signed in as.</p>
        <PortalButton />
      </Shell>
    );
  }

  const holdId = session.metadata?.hold_id || session.client_reference_id;
  if (!holdId) {
    return (
      <Shell title="Payment received" icon={CheckCircle2} tone="good" course={courseTitle}>
        <p>
          Stripe has your payment. We could not match it to a reserved seat automatically, so the
          institute will complete your registration by hand — nothing further is needed from you.
        </p>
        <PortalButton />
      </Shell>
    );
  }

  const metaTuition = Number(session.metadata?.tuition_cents);
  const cents =
    Number.isFinite(metaTuition) && metaTuition > 0 ? metaTuition : (session.amount_total ?? 0);

  const admin = createAdminClient();
  const { error } = await admin.rpc("redeem_hold", {
    p_hold_id: holdId,
    p_amount_paid: toDollars(cents),
  });

  if (error) {
    // The webhook is still coming, and it retries. Say something true rather
    // than something alarming.
    console.error(`[thanks] could not redeem ${holdId}`, error);
    return (
      <Shell title="Payment received" icon={Clock} tone="good" course={courseTitle}>
        <p>
          Stripe has your payment and your place is secure. We are still finishing your
          enrollment — refresh your portal in a minute and the course will be there.
        </p>
        <PortalButton />
      </Shell>
    );
  }

  const charge =
    typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent.latest_charge
      : null;
  const receiptUrl = typeof charge === "object" && charge ? charge.receipt_url : null;

  return (
    <Shell title="You are registered" icon={CheckCircle2} tone="good" course={courseTitle}>
      <p>
        {formatMoney(toDollars(cents))} received for <strong>{courseTitle}</strong>
        {cls.meeting_schedule ? `, ${cls.meeting_schedule}` : ""}.
      </p>
      <p className="mt-3">
        Your marks, attendance and certificate will appear in your portal as the term runs.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PortalButton />
        {receiptUrl ? (
          <Button asChild variant="outline">
            {/* Stripe's own page, so it opens away from the site. */}
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
              <Receipt className="mr-1.5 h-4 w-4" />
              View your receipt
            </a>
          </Button>
        ) : null}
      </div>
    </Shell>
  );
}

function PortalButton() {
  return (
    <Button asChild className="bg-primary hover:bg-primary-deep">
      <Link href="/portal">Go to your portal</Link>
    </Button>
  );
}

function Shell({
  title,
  course,
  icon: Icon,
  tone,
  children,
}: {
  title: string;
  course: string;
  icon: typeof CheckCircle2;
  tone: "good" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <p className="eyebrow">{course}</p>
      <div className="gold-rule mt-3" />

      <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3">
          <Icon className={tone === "good" ? "h-7 w-7 text-primary" : "h-7 w-7 text-destructive"} />
          <h1 className="font-display text-3xl text-primary">{title}</h1>
        </div>
        <div className="mt-4 leading-relaxed text-foreground/80">{children}</div>
      </div>
    </div>
  );
}
