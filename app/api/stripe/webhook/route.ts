import type Stripe from "stripe";
import { sendEmail } from "@/lib/email";
import { enrollmentConfirmed } from "@/lib/emails/enrollment-confirmed";
import { stripeClient, toDollars } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe's report of what happened on the payment page.
 *
 * This is the only place an enrollment is created from a payment, and it is
 * the only caller of `redeem_hold` — which is revoked from `anon` and
 * `authenticated` precisely so that nobody can enrol themselves by calling it.
 *
 * NOTHING ABOUT THIS REQUEST IS TRUSTED UNTIL THE SIGNATURE CHECKS OUT. The
 * route is a public POST endpoint on the open internet; anyone can send it a
 * JSON body claiming a seat was paid for. The signature, computed with a
 * shared secret Stripe and this server both hold, is the whole of the
 * authorisation — there is no session and no user behind it.
 *
 * It is also written to be delivered more than once. Stripe retries on any
 * non-2xx, and a retry must not enrol somebody twice or bank the same payment
 * twice. `redeem_hold` returns the existing enrollment for a hold already
 * redeemed, and the payments row is guarded by a unique index on the Stripe
 * session id.
 */

// The Stripe SDK wants Node, not the edge runtime.
export const runtime = "nodejs";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set; refusing every delivery");
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // The RAW body, byte for byte. The signature is computed over these exact
  // bytes, so parsing and re-serialising — even reading it as JSON first —
  // would reorder keys or change whitespace and every delivery would fail.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await stripeClient().webhooks.constructEventAsync(payload, signature, secret);
  } catch (cause) {
    // 400 on purpose: Stripe does not retry a signature failure, and there is
    // nothing to retry. A burst of these means the secret is wrong, or
    // somebody is probing.
    console.error("[stripe-webhook] rejected an unsigned or mis-signed delivery", cause);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // `completed` does not mean paid. A delayed method — bank debit, for
        // one — completes the page and settles days later, arriving as
        // async_payment_succeeded below. Redeeming here would hand out a seat
        // for money that has not moved.
        if (session.payment_status === "paid") {
          await bankPayment(session);
        } else {
          console.info(
            `[stripe-webhook] session ${session.id} completed unpaid (${session.payment_status}); waiting for settlement`,
          );
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        // A delayed method that has now settled. Only reachable if a slower
        // payment method is ever switched on in the Stripe dashboard; harmless
        // and correct until then.
        await bankPayment(event.data.object);
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        await releaseSeat(
          event.data.object,
          event.type === "checkout.session.expired" ? "expired" : "cancelled",
        );
        break;
      }

      default:
        // Everything else is acknowledged and ignored. Returning non-2xx for an
        // event we simply do not handle would have Stripe retry it for days.
        break;
    }
  } catch (cause) {
    // 500 so Stripe retries. A seat that was paid for and not recorded is the
    // worst outcome this system has, and the retry is the safety net.
    console.error(`[stripe-webhook] failed to handle ${event.type} (${event.id})`, cause);
    return new Response("Handler failed", { status: 500 });
  }

  return Response.json({ received: true });
}

/** The hold this session is paying for, however the id reached us. */
function holdIdOf(session: Stripe.Checkout.Session): string | null {
  return session.metadata?.hold_id || session.client_reference_id || null;
}

/**
 * Turn a paid session into an enrollment and a payment row.
 *
 * The amount credited is the TUITION carried in metadata, not `amount_total`.
 * They are equal today because the institute absorbs the processing fee, but
 * the enrollment's `amount_paid` is compared against `amount_due` to derive
 * payment status — so crediting a total that included a fee would make the
 * student read as overpaid on the finance report. `amount_total` is the
 * fallback only for a session created before this field existed.
 */
async function bankPayment(session: Stripe.Checkout.Session) {
  const holdId = holdIdOf(session);
  if (!holdId) {
    // Nothing to retry: this session was not started by us, or was started
    // before holds carried their id. Logged and acknowledged.
    console.error(`[stripe-webhook] paid session ${session.id} carries no hold id`);
    return;
  }

  const metaTuition = Number(session.metadata?.tuition_cents);
  const cents = Number.isFinite(metaTuition) && metaTuition > 0 ? metaTuition : (session.amount_total ?? 0);

  const supabase = createAdminClient();

  // Written before redeeming, because redeem_hold reads it off the hold to use
  // as the payment's reference — the thing that stops a redelivery banking the
  // same money twice. It is set here rather than trusted from checkout because
  // a student who returned and started a second session would have left a
  // different id on the hold than the one that actually paid.
  const { error: linkError } = await supabase
    .from("seat_holds")
    .update({ stripe_session_id: session.id, stripe_status: session.status ?? "complete" })
    .eq("id", holdId);

  if (linkError) throw new Error(`could not link hold ${holdId} to session: ${linkError.message}`);

  const { data: enrollmentId, error } = await supabase.rpc("redeem_hold", {
    p_hold_id: holdId,
    p_amount_paid: toDollars(cents),
  });

  if (error) throw new Error(`redeem_hold failed for ${holdId}: ${error.message}`);

  console.info(`[stripe-webhook] enrolled ${enrollmentId} from hold ${holdId} (${session.id})`);

  // Deliberately last, and deliberately unable to fail the handler. The seat
  // is already theirs; a Resend outage must not undo that by making this throw
  // and sending Stripe away to retry a payment that was banked correctly.
  // sendEmail never throws, so there is nothing here to guard against.
  if (enrollmentId) {
    await confirmByEmail(supabase, enrollmentId, session);
  }
}

/**
 * "You are registered", once the enrollment is real.
 *
 * The context comes from a SECURITY DEFINER function rather than from reading
 * people and classes directly, because service_role has no grant on either —
 * and widening that for the sake of one email would trade a precise hole for
 * a broad one.
 *
 * The idempotency key is the Stripe session. Stripe redelivers on any non-2xx,
 * and without it a student who triggered one retry would get two receipts.
 */
async function confirmByEmail(
  supabase: ReturnType<typeof createAdminClient>,
  enrollmentId: string,
  session: Stripe.Checkout.Session,
) {
  const { data, error } = await supabase.rpc("enrollment_email_context", {
    p_enrollment_id: enrollmentId,
  });

  if (error) {
    console.error(`[stripe-webhook] no email context for ${enrollmentId}: ${error.message}`);
    return;
  }

  const ctx = data?.[0];
  if (!ctx) {
    console.error(`[stripe-webhook] no email context for ${enrollmentId}`);
    return;
  }

  // The address on file wins; the one they typed at Stripe is the fallback for
  // somebody enrolled at the desk whose record has no email yet.
  const to = ctx.email ?? session.customer_email ?? null;

  // Stripe hosts a receipt page for every successful charge, whether or not it
  // emails one — that depends on a dashboard setting, and it sends none at all
  // for test payments. Linking the page is the only claim about receipts we can
  // make honestly. The lookup is allowed to fail: a missing link costs a line
  // of the email, and is not worth failing a delivered enrollment over.
  let receiptUrl: string | null = null;
  try {
    const full = await stripeClient().checkout.sessions.retrieve(session.id, {
      expand: ["payment_intent.latest_charge"],
    });
    const intent = full.payment_intent;
    const charge = typeof intent === "object" && intent ? intent.latest_charge : null;
    if (typeof charge === "object" && charge) receiptUrl = charge.receipt_url;
  } catch (cause) {
    console.warn(`[stripe-webhook] no receipt url for ${session.id}`, cause);
  }

  const { subject, html, text } = enrollmentConfirmed({
    firstName: ctx.first_name,
    courseCode: ctx.course_code,
    courseTitle: ctx.course_title,
    term: ctx.term,
    meetingSchedule: ctx.meeting_schedule,
    location: ctx.location,
    startDate: ctx.start_date,
    amountPaid: Number(ctx.amount_paid),
    receiptUrl,
  });

  await sendEmail({
    kind: "enrollment_confirmed",
    to,
    subject,
    html,
    text,
    personId: ctx.person_id,
    classId: session.metadata?.class_id ?? null,
    idempotencyKey: `enrolled:${session.id}`,
  });
}

/**
 * Give the seat back.
 *
 * Updated directly rather than through `release_hold`, which scopes itself to
 * the signed-in caller's own holds — there is no caller here. Guarded on
 * `released_at is null` so a redelivery cannot overwrite the reason on a hold
 * that has since been paid.
 */
async function releaseSeat(session: Stripe.Checkout.Session, reason: "expired" | "cancelled") {
  const holdId = holdIdOf(session);
  if (!holdId) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("seat_holds")
    .update({
      released_at: new Date().toISOString(),
      release_reason: reason,
      stripe_status: session.status ?? reason,
    })
    .eq("id", holdId)
    .is("released_at", null);

  if (error) throw new Error(`could not release hold ${holdId}: ${error.message}`);
}
