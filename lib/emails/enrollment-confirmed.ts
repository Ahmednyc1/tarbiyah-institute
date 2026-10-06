import "server-only";
import { formatMoney } from "@/lib/format";

/**
 * "You are registered" — sent once, by the Stripe webhook, after a payment.
 *
 * EMAIL HTML IS NOT WEB HTML. It is rendered by Outlook, Gmail's proxy, Apple
 * Mail and a dozen phone clients, most of which strip <style> blocks and
 * understand no layout newer than a table. So: tables for structure, styles
 * inline on every element, no flexbox, no grid, no classes, nothing external.
 * A stylesheet would be silently discarded and the message would arrive naked.
 *
 * The plain-text version is not a courtesy. Some clients prefer it, some
 * people configure it, and a message with no text alternative scores worse
 * with spam filters than one that has it.
 */

export type EnrollmentEmailContext = {
  firstName: string;
  courseCode: string;
  courseTitle: string;
  term: string;
  meetingSchedule: string | null;
  location: string | null;
  startDate: string | null;
  amountPaid: number;
  /** What the course costs. Lets the message tell a payer from a desk enrolment who still owes. */
  amountDue?: number;
  /** Stripe's hosted receipt. Always exists for a paid charge; absent only if the lookup failed. */
  receiptUrl?: string | null;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** A date a person would say out loud, in the institute's own timezone. */
function spokenDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Escape anything that reaches the HTML. Course titles are typed by admins. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function enrollmentConfirmed(ctx: EnrollmentEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  // First name only. "Assalamu alaikum Sh Mohammad Badawy" reads like a form
  // letter. It comes from the database column rather than being sliced out of
  // the full name, which guesses wrong on a name of more than two parts.
  const firstName = ctx.firstName.trim() || "there";

  const subject = `You're registered — ${ctx.courseTitle}`;

  // The same message serves a card payment and a desk enrolment. Somebody who
  // handed over cash on Friday has paid; somebody the sheikh added to the
  // roster may owe the whole fee. Telling the second group their payment has
  // gone through would be a lie, and telling them nothing about money leaves
  // them to find out at the next session.
  const owed = Math.max(0, (ctx.amountDue ?? ctx.amountPaid) - ctx.amountPaid);
  const opening =
    ctx.amountPaid > 0
      ? "Your payment has gone through and your place is confirmed."
      : "Your place is confirmed.";

  const rows: Array<[string, string]> = [
    ["Course", `${ctx.courseCode} · ${ctx.courseTitle}`],
    ["Term", ctx.term],
  ];
  if (ctx.meetingSchedule) rows.push(["Meets", ctx.meetingSchedule]);
  if (ctx.location) rows.push(["Where", ctx.location]);
  if (ctx.startDate) rows.push(["First session", spokenDate(ctx.startDate)]);
  if (ctx.amountPaid > 0) rows.push(["Paid", formatMoney(ctx.amountPaid)]);
  if (owed > 0) rows.push(["Still to pay", `${formatMoney(owed)} — at the desk`]);

  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:7px 16px 7px 0;color:#5b635b;font-size:14px;white-space:nowrap;vertical-align:top;">${esc(label)}</td>
          <td style="padding:7px 0;color:#1a211d;font-size:14px;font-weight:500;">${esc(value)}</td>
        </tr>`,
    )
    .join("");

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ef;margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dddcd2;border-radius:10px;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0 0 6px 0;color:#1d4a33;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;">MAS Tarbiya Institute</p>
            <h1 style="margin:0;color:#1a211d;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.2;">You&rsquo;re registered</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px 0 32px;color:#1a211d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 14px 0;">Assalamu alaikum ${esc(firstName)},</p>
            <p style="margin:0 0 20px 0;">${esc(opening)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f4ef;border-radius:8px;padding:4px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              ${htmlRows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 0 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a211d;">
            <p style="margin:0 0 20px 0;">Your marks, attendance and certificate will appear in your portal as the term runs.</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#1d4a33;border-radius:7px;">
                <a href="${SITE}/portal" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">Go to your portal</a>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #dddcd2;margin:0 0 16px 0;" />
            <p style="margin:0;color:#5b635b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;">
              ${ctx.receiptUrl ? `Your payment receipt is <a href="${esc(ctx.receiptUrl)}" style="color:#1d4a33;">here</a>. ` : ""}If anything above looks wrong, just reply to this message &mdash; it reaches the institute.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`.trim();

  const text = [
    `Assalamu alaikum ${firstName},`,
    ``,
    opening,
    ``,
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ``,
    `Your marks, attendance and certificate will appear in your portal as the term runs:`,
    `${SITE}/portal`,
    ``,
    ...(ctx.receiptUrl ? [`Your payment receipt: ${ctx.receiptUrl}`, ``] : []),
    `If anything above looks wrong, just reply to this message — it reaches the`,
    `institute.`,
    ``,
    `MAS Tarbiya Institute`,
  ].join("\n");

  return { subject, html, text };
}
