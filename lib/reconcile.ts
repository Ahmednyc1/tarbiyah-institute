import "server-only";
import { stripeClient, stripeIsConfigured, toDollars } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

/**
 * Money Stripe took that this database never recorded.
 *
 * The failure this exists for is an ABSENCE. When the webhook breaks, nothing
 * fires — there is no event called "the enrollment did not get written". So
 * nobody can be notified of it, and the first anyone hears is a student
 * emailing with their receipt. The only way to find it is to go and compare.
 *
 * DIRECTION MATTERS MORE THAN ANYTHING ELSE HERE. This runs Stripe → database:
 * for every session Stripe reports as paid, is there a payments row carrying
 * that session id? Run it the other way — from enrollments, asking Stripe —
 * and every single desk payment lights up as a problem, because recordPayment
 * leaves `reference` null. Same data, wrong direction, useless report.
 *
 * And never compare counts. Twenty paid against twenty recorded can still hide
 * one lost online payment sitting beside one cash enrolment. Match on the
 * session id, and name the person.
 */

/** How far back to look by default. Stripe keeps sessions far longer; this is about a readable page. */
const DEFAULT_DAYS = 90;

/**
 * A hard ceiling on how many sessions to walk, so a mistake cannot turn this
 * page into thousands of API calls. At roughly 40 registrations a term it is
 * years of headroom; if it is ever hit, the page says so rather than quietly
 * reporting on a slice.
 */
const MAX_SESSIONS = 2000;

/**
 * How many suspected orphans we will ask Stripe about individually.
 *
 * Should always be zero. If it is ever large, something has gone wrong that a
 * refund check will not fix, and spending hundreds of API calls to decorate the
 * alarm is not the right response — so past this point payments are listed
 * unchecked, which errs toward shouting.
 */
const MAX_REFUND_CHECKS = 50;

export type OrphanedPayment = {
  sessionId: string;
  paidAt: string;
  amount: number;
  email: string | null;
  personName: string | null;
  className: string | null;
  /** The hold exists and was redeemed — so the seat is fine and only the payment row is missing. */
  holdRedeemed: boolean;
  /** No hold at all: this session was not started by this system. */
  holdMissing: boolean;
  /**
   * Money already given back, for a payment that was only partly refunded.
   * Zero for the ordinary case. A *fully* refunded payment never appears in
   * this list at all.
   */
  refunded: number;
  /** Stripe could not be asked whether this was refunded, so it is listed anyway. */
  refundUnknown: boolean;
};

export type UnpaidEnrollment = {
  enrollmentId: string;
  studentName: string;
  studentNumber: string;
  className: string;
  owed: number;
  enrolledAt: string;
};

export type Reconciliation = {
  /** Null when Stripe is not configured — the page says so rather than showing a false all-clear. */
  orphans: OrphanedPayment[] | null;
  unpaid: UnpaidEnrollment[];
  sessionsChecked: number;
  /**
   * Payments that had no record here *and* turned out to be fully refunded, so
   * they were dropped from the alarm. Reported rather than hidden: "nothing is
   * missing, and I ignored two refunds" is a different claim from "nothing is
   * missing", and the difference is where a mistake would hide.
   */
  refundsIgnored: number;
  truncated: boolean;
  days: number;
  stripeError: string | null;
};

/**
 * Walk Stripe's paid sessions and find the ones this database does not know
 * about, then separately list enrollments with money still owed.
 *
 * The second list is informational, not an alarm: somebody enrolled at the
 * desk who has not paid yet is an ordinary state, and the institute decides
 * when to chase it.
 */
export async function reconcilePayments(days = DEFAULT_DAYS): Promise<Reconciliation> {
  const supabase = await createClient();

  const unpaid = await unpaidEnrollments(supabase);

  if (!stripeIsConfigured()) {
    return {
      orphans: null,
      unpaid,
      sessionsChecked: 0,
      refundsIgnored: 0,
      truncated: false,
      days,
      stripeError: "Online payment is not configured, so there is nothing to compare against.",
    };
  }

  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const paid: Array<{
    id: string;
    created: number;
    amount: number;
    email: string | null;
    personId: string | null;
    /** Needed only if this one turns out to look orphaned; that is where refunds live. */
    paymentIntent: string | null;
  }> = [];

  let sessionsChecked = 0;
  let truncated = false;

  try {
    const stripe = stripeClient();
    // The SDK paginates for you when iterated. Doing it by hand with
    // `limit: 100` and no loop is the classic version of this bug: it checks
    // the first hundred, reports all clear, and misses everything older.
    for await (const session of stripe.checkout.sessions.list({
      created: { gte: since },
      limit: 100,
    })) {
      sessionsChecked += 1;
      if (sessionsChecked > MAX_SESSIONS) {
        truncated = true;
        break;
      }
      if (session.payment_status !== "paid") continue;
      paid.push({
        id: session.id,
        created: session.created,
        amount: toDollars(
          Number(session.metadata?.tuition_cents) > 0
            ? Number(session.metadata?.tuition_cents)
            : (session.amount_total ?? 0),
        ),
        email: session.customer_email ?? null,
        personId: session.metadata?.person_id || null,
        paymentIntent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
      });
    }
  } catch (cause) {
    return {
      orphans: null,
      unpaid,
      sessionsChecked,
      refundsIgnored: 0,
      truncated,
      days,
      stripeError: cause instanceof Error ? cause.message : String(cause),
    };
  }

  if (!paid.length) {
    return {
      orphans: [],
      unpaid,
      sessionsChecked,
      refundsIgnored: 0,
      truncated,
      days,
      stripeError: null,
    };
  }

  const ids = paid.map((p) => p.id);

  // One query each rather than one per session.
  const [{ data: banked }, { data: holds }] = await Promise.all([
    supabase.from("payments").select("reference").in("reference", ids),
    supabase
      .from("seat_holds")
      .select("stripe_session_id, enrollment_id, person_id, classes ( courses ( title ) )")
      .in("stripe_session_id", ids),
  ]);

  const recorded = new Set((banked ?? []).map((p) => p.reference as string));
  const holdBySession = new Map(
    (holds ?? []).map((h) => [h.stripe_session_id as string, h]),
  );

  const suspect = paid.filter((p) => !recorded.has(p.id));

  // A payment that was given back is not money we failed to record, so asking
  // Stripe about refunds happens here — after the cheap set difference, and
  // only for the handful that look wrong. In the normal case `suspect` is
  // empty and this costs nothing at all.
  const { missing, refundsIgnored, refundState } = await setAsideRefunds(suspect);

  if (!missing.length) {
    return {
      orphans: [],
      unpaid,
      sessionsChecked,
      refundsIgnored,
      truncated,
      days,
      stripeError: null,
    };
  }

  // Only now, and only for the few that are wrong, look up who they are.
  const personIds = [
    ...new Set(
      missing
        .map((p) => p.personId ?? holdBySession.get(p.id)?.person_id ?? null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const names = new Map<string, string>();
  if (personIds.length) {
    const { data: people } = await supabase
      .from("people")
      .select("id, title, first_name, last_name")
      .in("id", personIds);
    for (const p of people ?? []) {
      names.set(p.id, [p.title, p.first_name, p.last_name].filter(Boolean).join(" "));
    }
  }

  const orphans: OrphanedPayment[] = missing.map((p) => {
    const hold = holdBySession.get(p.id);
    const personId = p.personId ?? hold?.person_id ?? null;
    return {
      sessionId: p.id,
      paidAt: new Date(p.created * 1000).toISOString(),
      amount: p.amount,
      email: p.email,
      personName: personId ? (names.get(personId) ?? null) : null,
      className: hold?.classes?.courses?.title ?? null,
      holdRedeemed: Boolean(hold?.enrollment_id),
      holdMissing: !hold,
      refunded: refundState.get(p.id)?.refunded ?? 0,
      refundUnknown: refundState.get(p.id)?.unknown ?? false,
    };
  });

  orphans.sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return { orphans, unpaid, sessionsChecked, refundsIgnored, truncated, days, stripeError: null };
}

/**
 * Split suspected orphans into the ones that were refunded and the ones that
 * are still a problem.
 *
 * WHY THIS IS NEEDED AT ALL. A Checkout Session's `payment_status` stays
 * "paid" forever once it is paid — refunds live on the charge underneath, not
 * on the session. So a refunded payment looks identical to a lost one from up
 * here, and the institute's first ever refund made this page cry wolf. An
 * alarm page that is wrong once is an alarm page nobody reads again.
 *
 * Partial refunds stay on the list. Money was kept, so there is still
 * something to account for, and the page says how much went back.
 *
 * WHEN STRIPE CANNOT BE ASKED, THE PAYMENT STAYS ON THE LIST, flagged. Failing
 * the other way — dropping anything we could not check — would turn an outage
 * into a silent all-clear, which is the one outcome this whole file exists to
 * prevent.
 */
async function setAsideRefunds<T extends { id: string; paymentIntent: string | null }>(
  suspect: T[],
): Promise<{
  missing: T[];
  refundsIgnored: number;
  refundState: Map<string, { refunded: number; unknown: boolean }>;
}> {
  const refundState = new Map<string, { refunded: number; unknown: boolean }>();
  if (!suspect.length) return { missing: suspect, refundsIgnored: 0, refundState };

  const stripe = stripeClient();
  const missing: T[] = [];
  let refundsIgnored = 0;

  for (const [index, item] of suspect.entries()) {
    if (index >= MAX_REFUND_CHECKS || !item.paymentIntent) {
      // Unchecked, so it stays on the list rather than being quietly dropped.
      refundState.set(item.id, { refunded: 0, unknown: index >= MAX_REFUND_CHECKS });
      missing.push(item);
      continue;
    }

    try {
      const intent = await stripe.paymentIntents.retrieve(item.paymentIntent, {
        expand: ["latest_charge"],
      });
      const charge =
        intent.latest_charge && typeof intent.latest_charge !== "string"
          ? intent.latest_charge
          : null;

      // `amount_captured` rather than `amount`: a payment that was authorised
      // but only partly captured was never fully taken in the first place.
      const captured = charge?.amount_captured ?? 0;
      const returned = charge?.amount_refunded ?? 0;

      if (captured > 0 && returned >= captured) {
        refundsIgnored += 1;
        continue;
      }

      refundState.set(item.id, { refunded: toDollars(returned), unknown: false });
      missing.push(item);
    } catch {
      refundState.set(item.id, { refunded: 0, unknown: true });
      missing.push(item);
    }
  }

  return { missing, refundsIgnored, refundState };
}

/**
 * Enrolled, and still owing.
 *
 * Not an alarm. A desk enrolment that has not paid yet is an ordinary state,
 * and 'waived' is a deliberate decision somebody already made — both are
 * excluded from being treated as problems, and the second is excluded
 * entirely.
 */
async function unpaidEnrollments(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<UnpaidEnrollment[]> {
  const { data } = await supabase
    .from("enrollments")
    .select(
      `id, amount_due, amount_paid, enrolled_at, payment_status, status,
       students ( student_number, people ( title, first_name, last_name ) ),
       classes ( courses ( title ) )`,
    )
    .neq("status", "dropped")
    .neq("payment_status", "waived")
    .order("enrolled_at", { ascending: false });

  return (data ?? [])
    .map((e) => ({
      enrollmentId: e.id,
      studentName:
        [e.students?.people?.title, e.students?.people?.first_name, e.students?.people?.last_name]
          .filter(Boolean)
          .join(" ") || "Unknown",
      studentNumber: e.students?.student_number ?? "",
      className: e.classes?.courses?.title ?? "Unknown course",
      owed: Math.max(0, Number(e.amount_due) - Number(e.amount_paid)),
      enrolledAt: e.enrolled_at as string,
    }))
    .filter((e) => e.owed > 0);
}
