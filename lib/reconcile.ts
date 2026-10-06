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
      truncated: false,
      days,
      stripeError: "Online payment is not configured, so there is nothing to compare against.",
    };
  }

  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const paid: Array<{ id: string; created: number; amount: number; email: string | null; personId: string | null }> =
    [];

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
      });
    }
  } catch (cause) {
    return {
      orphans: null,
      unpaid,
      sessionsChecked,
      truncated,
      days,
      stripeError: cause instanceof Error ? cause.message : String(cause),
    };
  }

  if (!paid.length) {
    return { orphans: [], unpaid, sessionsChecked, truncated, days, stripeError: null };
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

  const missing = paid.filter((p) => !recorded.has(p.id));
  if (!missing.length) {
    return { orphans: [], unpaid, sessionsChecked, truncated, days, stripeError: null };
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
    };
  });

  orphans.sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  return { orphans, unpaid, sessionsChecked, truncated, days, stripeError: null };
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
