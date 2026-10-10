import { alreadySent, sendEmail, sentPersonIds } from "@/lib/email";
import { classReminder } from "@/lib/emails/class-reminder";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * "Class is tomorrow", sent once each morning.
 *
 * The only part of this system that runs with nobody watching. Vercel calls it
 * on a schedule; there is no session, no user, and nothing to redirect to.
 *
 * IT ASKS THE QUESTION FRESH EVERY DAY rather than scheduling mail in advance.
 * A message queued at publish time cannot react to a change — cancel a session
 * and thirty people are still told to turn up — and Resend refuses to schedule
 * beyond 30 days, which a term exceeds. Reading the current state each morning
 * has nothing to cancel and no horizon: a moved session is simply not
 * tomorrow, and a cancelled one is filtered out in SQL.
 *
 * IT IS A PUBLIC URL. Anyone can call it. That is survivable because the worst
 * a stranger can do is cause the same reminders to be considered again, and
 * `sentPersonIds` means nobody is written to twice — but it is still guarded,
 * because an unauthenticated endpoint that sends mail is an invitation.
 */

export const runtime = "nodejs";
// Each recipient is a separate API call to Resend; a full class should finish
// in seconds, but the default 10s would be tight across several classes.
export const maxDuration = 60;

export async function GET(request: Request) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that variable
  // is set on the project. Refusing when it is absent is deliberate: a missing
  // secret must mean "nobody may call this", never "everybody may".
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set; refusing to run");
    return new Response("Not configured", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("sessions_due_tomorrow");
  if (error) {
    console.error(`[cron] could not read tomorrow's sessions: ${error.message}`);
    return new Response("Query failed", { status: 500 });
  }

  const rows = data ?? [];
  if (!rows.length) {
    console.info("[cron] nothing meets tomorrow");
    return Response.json({ sessions: 0, sent: 0, skipped: 0 });
  }

  // One row per recipient; group so each session is considered once.
  const bySession = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  let sent = 0;
  let skipped = 0;

  for (const [sessionId, students] of bySession) {
    // Cheapest question first: has this session already been reminded about?
    // It should not have been — this runs once a day and only matches the day
    // before — but a manual re-run, or a retry after a timeout, must not
    // notify a class twice.
    if (await alreadySent("class_reminder", sessionId)) {
      skipped += students.length;
      continue;
    }

    // And per person, so a run that half-finished can be re-run safely.
    const told = await sentPersonIds("class_reminder", sessionId);

    for (const student of students) {
      if (told.has(student.person_id)) {
        skipped += 1;
        continue;
      }

      const { subject, html, text } = classReminder({
        firstName: student.first_name,
        courseCode: student.course_code,
        courseTitle: student.course_title,
        sessionNumber: student.session_number,
        meetsOn: student.meets_on,
        startsAt: student.starts_at,
        sessionTitle: student.session_title,
        location: student.location,
      });

      const { ok } = await sendEmail({
        kind: "class_reminder",
        to: student.email,
        subject,
        html,
        text,
        personId: student.person_id,
        classId: student.class_id,
        contextId: sessionId,
        idempotencyKey: `reminder:${sessionId}:${student.person_id}`,
      });

      if (ok) sent += 1;
    }
  }

  console.info(
    `[cron] ${bySession.size} session(s) tomorrow: ${sent} reminded, ${skipped} already knew`,
  );

  return Response.json({ sessions: bySession.size, sent, skipped });
}
