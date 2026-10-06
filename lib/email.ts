import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Every email the institute sends goes through here.
 *
 * THIS FUNCTION DOES NOT THROW. Not on a missing key, not on a Resend outage,
 * not on a malformed address, not if the log write fails. A receipt that
 * cannot be sent must never undo the payment it was describing, and a failed
 * notification must never stop a teacher publishing marks. The worst outcome
 * of an email problem is that an email is missing — never that the thing it
 * was about did not happen.
 *
 * It records the attempt either way. A row with status 'failed' and the
 * provider's own message is what lets somebody answer "why did Yusuf hear
 * nothing" without a Resend login.
 */

export type EmailKind =
  | "enrollment_confirmed"
  | "address_confirmation"
  | "grades_published"
  | "session_published"
  | "class_reminder";

/**
 * Who it comes from, and where a reply lands.
 *
 * Two different addresses on purpose. Mail is sent from the verified
 * subdomain, which nobody reads — keeping the institute's sending reputation
 * separate from the masjid's own Google Workspace mail. Replies go to a real
 * mailbox a person checks.
 *
 * Both are overridable by environment so a preview deployment can be pointed
 * somewhere harmless without editing code.
 */
const FROM = process.env.EMAIL_FROM ?? "MAS Tarbiya Institute <institute@send.masnewyork.org>";
const REPLY_TO = process.env.EMAIL_REPLY_TO ?? "bk.institute@masnewyork.org";

/** Whether email is set up at all. Cheap, and safe to call anywhere. */
export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export type SendEmailInput = {
  kind: EmailKind;
  /** The recipient. A person with no address on file is a no-op, not an error. */
  to: string | null | undefined;
  subject: string;
  html: string;
  /** Plain-text alternative. Worth providing — some clients prefer it, and spam filters like it. */
  text?: string;
  personId?: string | null;
  classId?: string | null;
  /**
   * Resend refuses a second send carrying a key it has already seen. Pass one
   * wherever the caller might run twice — above all the Stripe webhook, which
   * is redelivered on any non-2xx and would otherwise send a second receipt.
   */
  idempotencyKey?: string;
  /** ISO 8601. Resend holds the message and sends it then, up to 30 days out. */
  scheduledAt?: string;
};

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string }> {
  const { kind, to, subject, html, text, personId, classId, idempotencyKey, scheduledAt } = input;

  if (!to) {
    // Nothing to send to and nothing useful to log against. Common and benign:
    // people added at the desk often have no address on file.
    console.warn(`[email] ${kind} skipped — no address for person ${personId ?? "(unknown)"}`);
    return { ok: false };
  }

  if (!emailIsConfigured()) {
    console.warn(`[email] ${kind} to ${to} skipped — RESEND_API_KEY is not set`);
    await record({ kind, to, subject, personId, classId, status: "failed", error: "not configured" });
    return { ok: false };
  }

  let providerId: string | undefined;
  let failure: string | undefined;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    // Resend returns errors in the result rather than throwing them; the
    // try/catch is for the layer below that — a network failure, a timeout.
    const { data, error } = await resend.emails.send(
      {
        from: FROM,
        to,
        replyTo: REPLY_TO,
        subject,
        html,
        ...(text ? { text } : {}),
        ...(scheduledAt ? { scheduledAt } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (error) failure = `${error.name}: ${error.message}`;
    else providerId = data?.id;
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : String(cause);
  }

  if (failure) {
    console.error(`[email] ${kind} to ${to} failed — ${failure}`);
  }

  await record({
    kind,
    to,
    subject,
    personId,
    classId,
    providerId,
    status: failure ? "failed" : "sent",
    error: failure,
  });

  return { ok: !failure, id: providerId };
}

/**
 * Write the attempt down.
 *
 * Swallows its own errors for the same reason as the caller: a database hiccup
 * while logging must not turn a delivered email into a thrown exception in the
 * middle of a payment. If this fails, the console is the fallback record.
 */
async function record(row: {
  kind: EmailKind;
  to: string;
  subject: string;
  personId?: string | null;
  classId?: string | null;
  providerId?: string;
  status: "sent" | "failed";
  error?: string;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("emails").insert({
      kind: row.kind,
      to_address: row.to,
      subject: row.subject,
      person_id: row.personId ?? null,
      class_id: row.classId ?? null,
      provider_id: row.providerId ?? null,
      status: row.status,
      error: row.error ?? null,
    });
    if (error) console.error(`[email] could not log ${row.kind} to ${row.to}: ${error.message}`);
  } catch (cause) {
    console.error(`[email] could not log ${row.kind} to ${row.to}`, cause);
  }
}
