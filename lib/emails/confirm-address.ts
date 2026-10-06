import "server-only";
import { createHash, randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
import { addressConfirmation } from "@/lib/emails/address-confirmation";
import { enrollmentConfirmed } from "@/lib/emails/enrollment-confirmed";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Proving that an address somebody typed actually reaches the person named.
 *
 * THE TOKEN IS GENERATED HERE AND HASHED BEFORE IT TOUCHES THE DATABASE. A
 * confirmation link is a credential — it asserts an identity on one click — so
 * the plaintext exists in exactly two places: the email, and the moment the
 * route checks it. A leaked database row is then a dead hash rather than a
 * working link.
 */

const LINK_HOURS = 24;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** 32 random bytes, URL-safe. Long enough that guessing is not a strategy. */
function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "by 3:42pm tomorrow, Tuesday 7 October" — the email states the deadline plainly. */
function expiryWording(iso: string): string {
  const when = new Date(iso);
  return when.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Ask somebody to confirm their address.
 *
 * Called by an admin, as that admin — `issue_email_confirmation` checks inside
 * that they are one. Never throws: this runs at the end of a desk enrolment
 * that has already succeeded, and a mail failure must not make the admin think
 * the student was not enrolled.
 *
 * Returns whether the message went out, so the screen can say so.
 */
export async function sendAddressConfirmation(
  personId: string,
  enrollmentId: string | null,
): Promise<boolean> {
  try {
    const { token, hash } = newToken();
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("issue_email_confirmation", {
      p_person_id: personId,
      p_token_hash: hash,
      p_enrollment_id: enrollmentId ?? undefined,
      p_hours: LINK_HOURS,
    });

    if (error) {
      console.error(`[confirm] could not issue for ${personId}: ${error.message}`);
      return false;
    }

    const row = data?.[0];
    if (!row) return false;

    const { subject, html, text } = addressConfirmation({
      firstName: row.first_name,
      confirmUrl: `${SITE}/confirm/${token}`,
      expiresWording: expiryWording(row.expires_at),
    });

    const { ok } = await sendEmail({
      kind: "address_confirmation",
      to: row.email,
      subject,
      html,
      text,
      personId,
      // No idempotency key, and no contextId check. A resend is the entire
      // point of this one — somebody who missed a 24-hour window needs another,
      // and `issue_email_confirmation` has already invalidated the old link.
    });

    return ok;
  } catch (cause) {
    console.error(`[confirm] could not send for ${personId}`, cause);
    return false;
  }
}

export type ConfirmOutcome = "confirmed" | "already" | "expired" | "changed" | "unknown" | "error";

/**
 * Spend a link, and send the real welcome if it worked.
 *
 * Reached by a public page with no session, so it runs on the service key and
 * the token hash is the whole of the authorisation.
 *
 * ON ONE CLICK RATHER THAN A BUTTON: this confirms on GET, which means a
 * corporate mail scanner that follows links could confirm on the recipient's
 * behalf. That is accepted deliberately. The question being answered is "does
 * this address reach the right organisation", and a scanner following the link
 * is itself evidence of that. Demanding a second click would cost every real
 * student a step to defend against a case that leaves the answer correct.
 */
export async function confirmAddress(token: string): Promise<ConfirmOutcome> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("confirm_email", { p_token_hash: hashToken(token) });

    if (error) {
      console.error(`[confirm] failed: ${error.message}`);
      return "error";
    }

    const row = data?.[0];
    if (!row) return "unknown";

    const outcome = row.outcome as ConfirmOutcome;

    // The welcome follows only a fresh confirmation. Clicking twice must not
    // send it twice, and an expired or superseded link proves nothing.
    if (outcome === "confirmed" && row.enrollment_id) {
      await sendWelcome(row.enrollment_id);
    }

    return outcome;
  } catch (cause) {
    console.error("[confirm] failed", cause);
    return "error";
  }
}

/**
 * The message that could not be sent before the address was proved.
 *
 * Same template the Stripe webhook uses, because it is the same message: here
 * is your course, here is when it meets, here is what has been paid. The only
 * difference is that this one arrives for somebody who registered at the desk,
 * so there may be no payment and no receipt to link.
 */
async function sendWelcome(enrollmentId: string) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("enrollment_email_context", {
      p_enrollment_id: enrollmentId ?? undefined,
    });

    if (error || !data?.[0]) {
      console.error(`[confirm] no email context for ${enrollmentId}: ${error?.message ?? "none"}`);
      return;
    }

    const ctx = data[0];
    const { subject, html, text } = enrollmentConfirmed({
      firstName: ctx.first_name,
      courseCode: ctx.course_code,
      courseTitle: ctx.course_title,
      term: ctx.term,
      meetingSchedule: ctx.meeting_schedule,
      location: ctx.location,
      startDate: ctx.start_date,
      amountPaid: Number(ctx.amount_paid),
      amountDue: Number(ctx.amount_due),
      receiptUrl: null,
    });

    await sendEmail({
      kind: "enrollment_confirmed",
      to: ctx.email,
      subject,
      html,
      text,
      personId: ctx.person_id,
      contextId: enrollmentId,
      idempotencyKey: `welcome:${enrollmentId}`,
    });
  } catch (cause) {
    console.error(`[confirm] could not welcome ${enrollmentId}`, cause);
  }
}

/**
 * Ask for confirmation, but only where it is actually worth asking.
 *
 * Called at the end of a desk enrolment. Skipped for somebody who has signed
 * in — their provider already proved the address — and for somebody with no
 * address at all, who is simply an offline record.
 *
 * Returns true only if a message went out, so the screen can say so rather
 * than guess.
 */
export async function confirmIfUnproved(enrollmentId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("enrollments")
      .select("students ( people ( id, email, email_confirmed_at, auth_user_id ) )")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (error) {
      console.error(`[confirm] could not read enrollment ${enrollmentId}: ${error.message}`);
      return false;
    }

    const person = data?.students?.people;
    if (!person?.email) return false;           // offline record, nothing to prove
    if (person.email_confirmed_at) return false; // already proved
    if (person.auth_user_id) return false;       // proved at sign-in by their provider

    return await sendAddressConfirmation(person.id, enrollmentId);
  } catch (cause) {
    console.error(`[confirm] could not evaluate ${enrollmentId}`, cause);
    return false;
  }
}
