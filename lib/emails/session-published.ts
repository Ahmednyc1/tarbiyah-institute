import "server-only";
import { hasLink, splitLinks } from "@/lib/links";

/**
 * "The notes are up" / "The recording is up" — sent when a published session
 * gains something a student would open the portal to collect.
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
  /** What is NEW in this save — not everything the session has. */
  news: SessionNews;
  classId: string;
};

/** The material a save added. Each is true only when it was absent before. */
export type SessionNews = { recording: boolean; slides: boolean; notes: boolean };

export const NOTHING_NEW: SessionNews = { recording: false, slides: false, notes: false };

type SessionMaterial = {
  is_published?: boolean | null;
  is_cancelled?: boolean | null;
  recording_url?: string | null;
  slides_path?: string | null;
  summary?: string | null;
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
 * What this save added that a student would want to hear about.
 *
 * Compared against the session as it was before the save, so only the
 * crossing from "absent" to "present" is news:
 *
 *   - a recording link where there was none
 *   - slides where there were none
 *   - a summary that now contains a link (the notes) where it had none
 *
 * Changing a link that was already there is NOT news. Students already know
 * where to look, and an email for every corrected typo would teach them to
 * ignore the institute's mail.
 *
 * A session nobody can see announces nothing: unpublished and cancelled
 * sessions return NOTHING_NEW. When a session is published — or un-cancelled —
 * in this save, everything on it counts as new, because no student has seen
 * any of it. `announcedBefore` is the exception: a session that was published,
 * announced, hidden and published again should not tell the class twice about
 * material they were already told about.
 *
 * A title and a summary with no link are context, not material. Laying out a
 * syllabus — six dated, empty sessions before term — announces nothing.
 */
export function sessionNews(
  before: SessionMaterial | null,
  after: SessionMaterial,
  announcedBefore = false,
): SessionNews {
  const visible = (s: SessionMaterial | null) => Boolean(s?.is_published) && !s?.is_cancelled;

  if (!visible(after)) return NOTHING_NEW;

  const previous: SessionMaterial | null = visible(before) || announcedBefore ? before : null;

  return {
    recording: Boolean(after.recording_url) && !previous?.recording_url,
    slides: Boolean(after.slides_path) && !previous?.slides_path,
    notes: hasLink(after.summary) && !hasLink(previous?.summary),
  };
}

export function anythingNew(news: SessionNews): boolean {
  return news.recording || news.slides || news.notes;
}

/** "The recording", "The recording and notes", "The recording, slides and notes". */
function describe(news: SessionNews): string | null {
  const items = [
    news.recording && "recording",
    news.slides && "slides",
    news.notes && "notes",
  ].filter(Boolean) as string[];

  if (items.length === 0) return null;
  const list =
    items.length === 1 ? items[0] : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  // "The slides are up", "The recording is up" — plural when it is a list or slides/notes.
  const plural = items.length > 1 || items[0] !== "recording";
  return `The ${list} ${plural ? "are" : "is"} up`;
}

/** The summary for the email body, with its links drawn as links. */
function summaryAsHtml(summary: string): string {
  return splitLinks(summary)
    .map((p) =>
      p.kind === "text"
        ? esc(p.text)
        : `<a href="${esc(p.href)}" style="color:#1d4a33;text-decoration:underline;">${esc(p.label)}</a>`,
    )
    .join("");
}

/** The summary for the plain-text email: a named link becomes "Name: address". */
function summaryAsText(summary: string): string {
  return splitLinks(summary)
    .map((p) => (p.kind === "text" ? p.text : p.named ? `${p.label}: ${p.href}` : p.href))
    .join("");
}

export function sessionPublished(ctx: SessionEmailContext): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = ctx.firstName.trim() || "there";
  const heading = ctx.title?.trim() || `Session ${ctx.sessionNumber}`;

  // What is NEW decides what the message promises. Telling somebody a
  // recording is up when only the notes are would send thirty people to the
  // portal to find nothing.
  const what = describe(ctx.news);

  if (what === null) {
    throw new Error(
      "sessionPublished called with nothing new to announce — guard with anythingNew first",
    );
  }

  // "Recording is up — …", capitalised: the subject drops the leading "The".
  const short = what.replace(/^The /, "");
  const subject = `${short[0].toUpperCase()}${short.slice(1)} — ${ctx.courseTitle}, session ${ctx.sessionNumber}`;

  const summaryHtml = ctx.summary?.trim()
    ? `<p style="margin:0 0 18px 0;color:#5b635b;font-size:14px;line-height:1.6;">${summaryAsHtml(ctx.summary.trim())}</p>`
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
    ...(ctx.summary?.trim() ? [``, summaryAsText(ctx.summary.trim())] : []),
    ``,
    `${SITE}/portal`,
    ``,
    `You are receiving this because you are enrolled in ${ctx.courseTitle}.`,
    `Reply to this message and it reaches the institute.`,
  ].join("\n");

  return { subject, html, text };
}
