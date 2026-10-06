import "server-only";

/**
 * "Your mark is up" — sent when an assignment is published, to the students
 * who actually have a mark on it.
 *
 * THE MARK ITSELF IS NOT IN THE MESSAGE. Email is not private storage: it sits
 * in an inbox for years, gets forwarded, and is read on a shared family screen
 * as often as a personal one. A student's score is theirs to look at, and
 * signing in to see it is one click. So this says a mark exists and where to
 * find it, and nothing about what it is.
 *
 * Same rendering constraints as every template here — see
 * enrollment-confirmed.ts for why email HTML looks like 2003.
 */

export type GradesEmailContext = {
  firstName: string;
  courseCode: string;
  courseTitle: string;
  assignmentName: string;
  dueDate: string | null;
  categoryName: string | null;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function spokenDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function gradesPublished(ctx: GradesEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = ctx.firstName.trim() || "there";
  const subject = `Your mark is up — ${ctx.assignmentName}`;

  const detail = [
    ctx.categoryName,
    ctx.dueDate ? `Due ${spokenDate(ctx.dueDate)}` : null,
  ].filter(Boolean);

  const detailHtml = detail.length
    ? `<p style="margin:6px 0 0 0;color:#8d948d;font-size:13px;">${esc(detail.join(" · "))}</p>`
    : "";

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ef;margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dddcd2;border-radius:10px;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0 0 6px 0;color:#1d4a33;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;">${esc(ctx.courseCode)} &middot; ${esc(ctx.courseTitle)}</p>
            <h1 style="margin:0;color:#1a211d;font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:600;line-height:1.2;">${esc(ctx.assignmentName)}</h1>
            ${detailHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px;color:#1a211d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 14px 0;">Assalamu alaikum ${esc(firstName)},</p>
            <p style="margin:0 0 18px 0;">Your mark for this has been posted, along with any feedback from your instructor. Sign in to see it.</p>
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#1d4a33;border-radius:7px;">
                <a href="${SITE}/portal" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">See your mark</a>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #dddcd2;margin:0 0 16px 0;" />
            <p style="margin:0;color:#5b635b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;">
              Marks are not sent by email &mdash; they live in your portal, where only you can see them. If something looks wrong, reply to this message and it reaches the institute.
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
    `Your mark for "${ctx.assignmentName}" has been posted, along with any`,
    `feedback from your instructor. Sign in to see it.`,
    ``,
    `${ctx.courseCode} · ${ctx.courseTitle}`,
    ...(detail.length ? [detail.join(" · ")] : []),
    ``,
    `${SITE}/portal`,
    ``,
    `Marks are not sent by email — they live in your portal, where only you can`,
    `see them. If something looks wrong, reply to this message and it reaches`,
    `the institute.`,
  ].join("\n");

  return { subject, html, text };
}
