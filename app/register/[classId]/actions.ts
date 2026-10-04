"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/account";
import { isChargeable, stripeClient, stripeIsConfigured, toCents } from "@/lib/stripe";
import { createClient } from "@/lib/supabase/server";

export type CheckoutState = { error?: string } | null;

/**
 * How long the seat is held, and how long Stripe's page lives.
 *
 * The hold must always outlive the page — see the note at the top of
 * 20260924120000_seat_holds.sql. If the page outlived the hold, somebody could
 * pay on a page Stripe still honours for a seat we had already given away:
 * money taken, nothing given.
 *
 * Stripe accepts an `expires_at` between 30 minutes and 24 hours from
 * creation, so the page cannot simply be made short. 31 rather than 30 because
 * the floor is checked against Stripe's clock at the moment the request lands;
 * a round 30 computed here can arrive as 29:59 and be rejected outright.
 */
const HOLD_MINUTES = 40;
const PAGE_MINUTES = 31;

/**
 * Where to send Stripe's success and cancel links.
 *
 * `NEXT_PUBLIC_SITE_URL` wins when it is set. The Host header is attacker-
 * controllable, and while a forged one could only redirect the forger's own
 * checkout, there is no reason to put a value we do not control into a URL we
 * hand to a payment provider. The header is the fallback so that local
 * development and preview deployments work without configuration.
 */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Reserves a seat and sends the student to Stripe to pay for it.
 *
 * This is a public POST endpoint — the registration page's layout does not
 * guard it. Almost nothing is checked here on purpose: `hold_seat` is
 * SECURITY DEFINER and already refuses an unauthenticated caller, a class that
 * is not open, one whose first session has passed, one that is full, somebody
 * already enrolled, and somebody who paid and dropped. Repeating those tests
 * in TypeScript would be a second definition of the rules, free to drift from
 * the one that is actually enforced.
 */
export async function startCheckout(
  _prev: CheckoutState,
  formData: FormData,
): Promise<CheckoutState> {
  const classId = String(formData.get("classId") ?? "");
  if (!classId) return { error: "Missing class." };

  if (!stripeIsConfigured()) {
    return { error: "Online payment is not set up yet. Please register at the desk." };
  }

  const viewer = await getViewer();
  if (!viewer) return { error: "Please sign in before paying." };

  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, term, meeting_schedule, registration_fee, courses ( code, title )")
    .eq("id", classId)
    .maybeSingle();

  if (!cls?.courses) return { error: "We could not find that course." };

  const fee = Number(cls.registration_fee);
  if (!isChargeable(fee)) {
    // A free or near-free class cannot go through Stripe at all — the API
    // refuses anything under 50 cents. Nothing in the catalogue is priced that
    // way today, and inventing a no-payment enrolment path here would mean a
    // second way to create an enrollment that nobody has reviewed.
    return { error: "This course cannot be paid for online. Please register at the desk." };
  }

  const { data: holdId, error: holdError } = await supabase.rpc("hold_seat", {
    p_class_id: classId,
    p_minutes: HOLD_MINUTES,
  });

  // hold_seat raises sentences meant to be read — "This course is full", "You
  // are already enrolled in this course" — so they are passed through rather
  // than replaced with something vaguer.
  if (holdError) return { error: holdError.message };
  if (!holdId) return { error: "We could not reserve a seat. Please try again." };

  const origin = await siteOrigin();
  const tuitionCents = toCents(fee);
  let paymentUrl: string;

  try {
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Stripe emails its own receipt to this address, which is why no SMTP of
      // our own is needed for the money half of registration.
      customer_email: viewer.email ?? undefined,
      client_reference_id: holdId,
      expires_at: Math.floor(Date.now() / 1000) + PAGE_MINUTES * 60,
      submit_type: "pay",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: tuitionCents,
            product_data: {
              name: cls.courses.title,
              description:
                [cls.courses.code, cls.meeting_schedule ?? cls.term].filter(Boolean).join(" · ") ||
                "MAS Tarbiya Institute",
            },
          },
        },
      ],
      metadata: {
        hold_id: holdId,
        class_id: classId,
        person_id: viewer.personId ?? "",
        // The tuition, recorded separately from whatever Stripe ends up
        // collecting. Today they are the same number because the institute
        // absorbs the processing fee. If that policy ever changes, the
        // enrollment must still be credited with the tuition alone — crediting
        // it with the total would make every fee-covering student read as
        // overpaid on the finance report.
        tuition_cents: String(tuitionCents),
      },
      success_url: `${origin}/register/${classId}/thanks?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/register/${classId}?cancelled=1`,
    });

    if (!session.url) throw new Error("Stripe returned a session with no URL.");
    paymentUrl = session.url;

    await supabase.rpc("attach_checkout_session", {
      p_hold_id: holdId,
      p_session_id: session.id,
      p_status: session.status ?? "open",
    });
  } catch (cause) {
    // The seat was reserved a moment ago and the student is not going to pay
    // for it. Leaving it would hold a place against the class for forty
    // minutes for somebody who never saw a payment page.
    await supabase.rpc("release_hold", { p_hold_id: holdId, p_reason: "cancelled" });
    console.error("[checkout] could not start a Stripe session", cause);
    return { error: "We could not reach the payment provider. Please try again in a moment." };
  }

  // Outside the try: redirect() works by throwing, and a catch would swallow it.
  redirect(paymentUrl);
}
