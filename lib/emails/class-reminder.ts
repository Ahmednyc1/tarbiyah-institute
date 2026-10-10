import "server-only";

/**
 * "Your class is tomorrow" — sent once per session, the morning before.
 *
 * The shortest message the institute sends, deliberately. Somebody glancing at
 * a phone needs the day, the time and the place; anything else is in the way.
 *
 * Same rendering constraints as every template here — see
 * enrollment-confirmed.ts for why email HTML looks like 2003.
 */

export type ReminderContext = {
  firstName: string;
  courseCode: string;
  courseTitle: string;
  sessionNumber: number;
  meetsOn: string;
  startsAt: string | null;
  sessionTitle: string | null;
  location: string | null;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function spokenDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "7:00pm" from a Postgres time. Lower case and no leading zero reads like speech. */
function spokenTime(value: string | null): string | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return null;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? "am" : "pm";
  return m ? `${hour12}:${String(m).padStart(2, "0")}${suffix}` : `${hour12}${suffix}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function classReminder(ctx: ReminderContext): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = ctx.firstName.trim() || "there";
  const time = spokenTime(ctx.startsAt);
  const when = `${spokenDate(ctx.meetsOn)}${time ? ` at ${time}` : ""}`;

  const subject = `Tomorrow: ${ctx.courseTitle}${time ? `, ${time}` : ""}`;

  const lines: Array<[string, string]> = [["When", when]];
  if (ctx.location) lines.push(["Where", ctx.location]);
  lines.push([
    "Session",
    ctx.sessionTitle?.trim()
      ? `${ctx.sessionNumber} — ${ctx.sessionTitle.trim()}`
      : String(ctx.sessionNumber),
  ]);

  const rows = lines
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
            <p style="margin:0 0 6px 0;color:#1d4a33;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;">${esc(ctx.courseCode)} &middot; ${esc(ctx.courseTitle)}</p>
            <h1 style="margin:0;color:#1a211d;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:600;line-height:1.2;">Class is tomorrow</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 32px 0 32px;color:#1a211d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 18px 0;">Assalamu alaikum ${esc(firstName)},</p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f4ef;border-radius:8px;padding:4px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
              ${rows}
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #dddcd2;margin:0 0 16px 0;" />
            <p style="margin:0;color:#5b635b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;">
              Can&rsquo;t make it? Reply to this message and let the institute know &mdash; an absence the sheikh knows about in advance is recorded as excused and left out of your attendance mark entirely. Your <a href="${SITE}/portal" style="color:#1d4a33;">portal</a> has the rest of the term.
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
    `${ctx.courseCode} · ${ctx.courseTitle} meets tomorrow.`,
    ``,
    ...lines.map(([label, value]) => `${label}: ${value}`),
    ``,
    `Can't make it? Reply and let the institute know — an absence the sheikh`,
    `knows about in advance is recorded as excused and left out of your`,
    `attendance mark entirely.`,
    ``,
    `${SITE}/portal`,
  ].join("\n");

  return { subject, html, text };
}
