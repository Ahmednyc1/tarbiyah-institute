import "server-only";

/**
 * "Session 3 is up" — sent once, the first time a session is published.
 *
 * Same constraints as every template here: tables, inline styles, nothing
 * external, and a real plain-text alternative. See enrollment-confirmed.ts for
 * why.
 */

export type SessionEmailContext = {
  firstName: string;
  courseCode: string;
  courseTitle: string;
  sessionNumber: number;
  meetsOn: string;
  title: string | null;
  summary: string | null;
  hasRecording: boolean;
  hasSlides: boolean;
  classId: string;
};

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

function spokenDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
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

/**
 * Is there anything here worth telling a class about?
 *
 * Publishing a session and attaching material to it are two different acts
 * that happen to touch the same row. The first is how a teacher lays out a
 * syllabus — six dated, empty sessions before term starts. The second is what
 * a student actually wants to hear about. Only the second is news.
 *
 * Callers check this before building a message. `sessionPublished` throws if
 * they forget, because a wrong announcement to a whole class is worse than a
 * caught error in a log.
 */
export function canAnnounceSession(session: {
  recording_url?: string | null;
  slides_path?: string | null;
}): boolean {
  return Boolean(session.recording_url) || Boolean(session.slides_path);
}

export function sessionPublished(ctx: SessionEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = ctx.firstName.trim() || "there";
  const heading = ctx.title?.trim() || `Session ${ctx.sessionNumber}`;

  // What is actually available decides what the message promises. Telling
  // somebody a recording is up when only the slides are would send thirty
  // people to the portal to find nothing.
  //
  // THERE IS NO FOURTH BRANCH, AND THAT IS THE POINT. This used to fall
  // through to "The notes are up", which was wrong twice over: `class_sessions`
  // has no notes column for it to be describing — only title, summary,
  // recording_url and slides_path — and the branch was reached whenever a
  // session had neither a recording nor slides, which is the normal state of
  // every session in a syllabus laid out before term starts. Publishing six
  // dated but empty sessions would have told the class six times that notes
  // were up, and sent them to a page with nothing on it.
  //
  // A recording and slides are the only things a student opens the portal to
  // collect. A title and a summary are context and belong in the body. When
  // neither attachment is present there is nothing to announce, so this
  // returns null and `canAnnounce` below turns that into silence.
  const what =
    ctx.hasRecording && ctx.hasSlides
      ? "The recording and slides are up"
      : ctx.hasRecording
        ? "The recording is up"
        : ctx.hasSlides
          ? "The slides are up"
          : null;

  if (what === null) {
    throw new Error(
      "sessionPublished called for a session with nothing to announce — " +
        "guard with canAnnounceSession first",
    );
  }

  const subject = `${what.replace(/^The /, "")} — ${ctx.courseTitle}, session ${ctx.sessionNumber}`;

  const summaryHtml = ctx.summary?.trim()
    ? `<p style="margin:0 0 18px 0;color:#5b635b;font-size:14px;line-height:1.6;">${esc(ctx.summary.trim())}</p>`
    : "";

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4ef;margin:0;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dddcd2;border-radius:10px;">
        <tr>
          <td style="padding:32px 32px 8px 32px;">
            <p style="margin:0 0 6px 0;color:#1d4a33;font-size:11px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;">${esc(ctx.courseCode)} &middot; ${esc(ctx.courseTitle)}</p>
            <h1 style="margin:0;color:#1a211d;font-family:Georgia,'Times New Roman',serif;font-size:25px;font-weight:600;line-height:1.2;">${esc(heading)}</h1>
            <p style="margin:6px 0 0 0;color:#8d948d;font-size:13px;">Session ${ctx.sessionNumber} &middot; ${esc(spokenDate(ctx.meetsOn))}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 0 32px;color:#1a211d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 14px 0;">Assalamu alaikum ${esc(firstName)},</p>
            <p style="margin:0 0 18px 0;">${esc(what)} in your portal.</p>
            ${summaryHtml}
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:#1d4a33;border-radius:7px;">
                <a href="${SITE}/portal" style="display:inline-block;padding:11px 22px;color:#ffffff;font-size:15px;font-weight:500;text-decoration:none;">Open your portal</a>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:26px 32px 32px 32px;">
            <hr style="border:none;border-top:1px solid #dddcd2;margin:0 0 16px 0;" />
            <p style="margin:0;color:#5b635b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;">
              You are receiving this because you are enrolled in ${esc(ctx.courseTitle)}. Reply to this message and it reaches the institute.
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
    `${what} in your portal.`,
    ``,
    `${ctx.courseCode} · ${ctx.courseTitle}`,
    `Session ${ctx.sessionNumber} — ${heading}`,
    `${spokenDate(ctx.meetsOn)}`,
    ...(ctx.summary?.trim() ? [``, ctx.summary.trim()] : []),
    ``,
    `${SITE}/portal`,
    ``,
    `You are receiving this because you are enrolled in ${ctx.courseTitle}.`,
    `Reply to this message and it reaches the institute.`,
  ].join("\n");

  return { subject, html, text };
}
