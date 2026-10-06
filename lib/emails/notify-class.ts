import "server-only";
import { alreadySent, sendEmail, sentPersonIds } from "@/lib/email";
import { gradesPublished } from "@/lib/emails/grades-published";
import { sessionPublished } from "@/lib/emails/session-published";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Telling a whole class something.
 *
 * NOTHING HERE THROWS. These run at the end of a teacher's save action, after
 * the thing they clicked has already succeeded. A mail problem must never make
 * somebody believe their edit was lost and do it again — so every failure is
 * logged and swallowed, and the count of messages sent is the return value.
 *
 * The roster comes from `class_roster_email_context`, which checks inside that
 * the caller teaches the class. It is called with the teacher's own client
 * rather than the service key precisely so that check applies: this is the one
 * function that can enumerate student addresses, and the caller should have to
 * prove who they are.
 */

/**
 * "Session 3 is up", once per session, ever.
 *
 * Returns how many students were written to. Zero is an ordinary outcome: the
 * class may be empty, already notified, or nobody on it may have an address.
 */
export async function notifyClassSessionPublished(
  classId: string,
  sessionId: string,
): Promise<number> {
  try {
    // Asked before anything is built, because the common case is "already
    // sent" — a teacher re-saving a published session — and that should cost
    // one indexed lookup.
    if (await alreadySent("session_published", sessionId)) return 0;

    const supabase = await createClient();

    const [{ data: session }, { data: roster, error: rosterError }] = await Promise.all([
      supabase
        .from("class_sessions")
        .select(
          `session_number, meets_on, title, summary, recording_url, slides_path,
           classes ( courses ( code, title ) )`,
        )
        .eq("id", sessionId)
        .maybeSingle(),
      supabase.rpc("class_roster_email_context", { p_class_id: classId }),
    ]);

    if (rosterError) {
      console.error(`[notify] roster refused for class ${classId}: ${rosterError.message}`);
      return 0;
    }

    const course = session?.classes?.courses;
    if (!session || !course) {
      console.error(`[notify] no session or course for ${sessionId}`);
      return 0;
    }
    if (!roster?.length) return 0;

    let sent = 0;
    for (const student of roster) {
      const { subject, html, text } = sessionPublished({
        firstName: student.first_name,
        courseCode: course.code,
        courseTitle: course.title,
        sessionNumber: session.session_number,
        meetsOn: session.meets_on,
        title: session.title,
        summary: session.summary,
        hasRecording: Boolean(session.recording_url),
        hasSlides: Boolean(session.slides_path),
        classId,
      });

      const { ok } = await sendEmail({
        kind: "session_published",
        to: student.email,
        subject,
        html,
        text,
        personId: student.person_id,
        classId,
        // The session, so `alreadySent` can refuse a second announcement of it
        // however long afterwards the teacher re-saves.
        contextId: sessionId,
        // Belt and braces inside the 24 hours Resend honours it: two rapid
        // saves could otherwise both pass the alreadySent check before either
        // had written its row.
        idempotencyKey: `session:${sessionId}:${student.person_id}`,
      });

      if (ok) sent += 1;
    }

    console.info(`[notify] session ${sessionId}: ${sent} of ${roster.length} notified`);
    return sent;
  } catch (cause) {
    console.error(`[notify] session ${sessionId} failed`, cause);
    return 0;
  }
}

/**
 * "Your mark is up", to the students who actually have one.
 *
 * Per recipient rather than per assignment, unlike the session notification.
 * A teacher may publish with half the class marked and finish on Tuesday; the
 * second publish must reach the people marked later and nobody else. Whoever
 * has already been told is filtered out rather than relied on not to crop up.
 *
 * Returns how many students were written to. Zero is ordinary: nothing marked
 * yet, or everybody already told.
 */
export async function notifyAssignmentPublished(
  classId: string,
  assignmentId: string,
): Promise<number> {
  try {
    const supabase = await createClient();

    const [{ data: assignment }, { data: recipients, error: listError }, told] = await Promise.all([
      supabase
        .from("assignments")
        .select("name, due_date, grade_categories ( name ), classes ( courses ( code, title ) )")
        .eq("id", assignmentId)
        .maybeSingle(),
      supabase.rpc("assignment_marked_recipients", { p_assignment_id: assignmentId }),
      sentPersonIds("grades_published", assignmentId),
    ]);

    if (listError) {
      console.error(`[notify] recipients refused for ${assignmentId}: ${listError.message}`);
      return 0;
    }

    const course = assignment?.classes?.courses;
    if (!assignment || !course) {
      console.error(`[notify] no assignment or course for ${assignmentId}`);
      return 0;
    }

    const pending = (recipients ?? []).filter((r) => !told.has(r.person_id));
    if (!pending.length) return 0;

    let sent = 0;
    for (const student of pending) {
      const { subject, html, text } = gradesPublished({
        firstName: student.first_name,
        courseCode: course.code,
        courseTitle: course.title,
        assignmentName: assignment.name,
        dueDate: assignment.due_date,
        categoryName: assignment.grade_categories?.name ?? null,
      });

      const { ok } = await sendEmail({
        kind: "grades_published",
        to: student.email,
        subject,
        html,
        text,
        personId: student.person_id,
        classId,
        contextId: assignmentId,
        idempotencyKey: `grades:${assignmentId}:${student.person_id}`,
      });

      if (ok) sent += 1;
    }

    console.info(
      `[notify] assignment ${assignmentId}: ${sent} of ${pending.length} notified ` +
        `(${told.size} already knew)`,
    );
    return sent;
  } catch (cause) {
    console.error(`[notify] assignment ${assignmentId} failed`, cause);
    return 0;
  }
}

/** Kept here so the admin screen and tests can read the log without the service key leaking out. */
export async function recentEmails(limit = 50) {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("emails")
    .select("id, kind, to_address, subject, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
