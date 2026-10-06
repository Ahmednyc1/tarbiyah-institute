"use server";

import { revalidatePath } from "next/cache";
import { notifyClassSessionPublished } from "@/lib/emails/notify-class";
import { NOT_ALLOWED, denied, graderViewer } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type SessionState = { error?: string; ok?: string } | null;

function refresh(classId: string) {
  revalidatePath(`/gradebook/${classId}/sessions`);
  revalidatePath(`/gradebook/${classId}/attendance`);
  revalidatePath(`/gradebook/${classId}`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Lays out a whole term at a fixed interval. */
export async function generateSessions(
  _prev: SessionState,
  formData: FormData,
): Promise<SessionState> {
  const classId = String(formData.get("classId") ?? "");
  if (!(await graderViewer(classId))) return { error: NOT_ALLOWED };

  const first = String(formData.get("first") ?? "");
  const count = Number(formData.get("count"));
  const everyDays = Number(formData.get("everyDays") ?? 7);

  if (!ISO_DATE.test(first)) return { error: "Choose the date of the first session." };
  if (!Number.isInteger(count) || count < 1) return { error: "How many sessions?" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_sessions", {
    p_class_id: classId,
    p_first: first,
    p_count: count,
    p_every_days: everyDays,
  });

  if (error) return { error: error.message };

  refresh(classId);
  return { ok: `${count} sessions laid out. Edit any of them below.` };
}

export async function saveSession(_prev: SessionState, formData: FormData): Promise<SessionState> {
  const classId = String(formData.get("classId") ?? "");
  if (!(await graderViewer(classId))) return { error: NOT_ALLOWED };

  const sessionId = String(formData.get("sessionId") ?? "");
  const meetsOn = String(formData.get("meetsOn") ?? "");
  const recording = String(formData.get("recordingUrl") ?? "").trim();

  if (!sessionId) return { error: "Missing session." };
  if (!ISO_DATE.test(meetsOn)) return { error: "Choose a valid date." };

  // The database enforces this too; catching it here gives a sentence rather
  // than a constraint name.
  if (recording && !/^https?:\/\//i.test(recording)) {
    return { error: "A recording link must start with http:// or https://" };
  }

  const publishing = formData.get("isPublished") === "on";

  // What it was before, so the crossing can be told from an ordinary save.
  // A teacher saves repeatedly — fixing a typo, correcting a date — and only
  // unpublished-to-published should reach thirty inboxes.
  const supabase = await createClient();
  const { data: before } = await supabase
    .from("class_sessions")
    .select("is_published")
    .eq("id", sessionId)
    .maybeSingle();

  const { error } = await supabase
    .from("class_sessions")
    .update({
      meets_on: meetsOn,
      starts_at: String(formData.get("startsAt") ?? "") || null,
      title: String(formData.get("title") ?? "").trim() || null,
      summary: String(formData.get("summary") ?? "").trim() || null,
      recording_url: recording || null,
      is_cancelled: formData.get("isCancelled") === "on",
      is_published: publishing,
    })
    .eq("id", sessionId);

  if (error) return { error: error.message };

  refresh(classId);

  // After the save, and unable to undo it. notifyClassSessionPublished never
  // throws; a mail problem must not make a teacher think their edit was lost.
  // A cancelled session is not announced — nobody wants "the recording is up"
  // for a class that did not run.
  if (publishing && !before?.is_published && formData.get("isCancelled") !== "on") {
    const sent = await notifyClassSessionPublished(classId, sessionId);
    if (sent > 0) return { ok: `Saved. ${sent} student${sent === 1 ? "" : "s"} notified.` };
  }

  return { ok: "Saved." };
}

/**
 * Clears the whole term so it can be laid out again.
 *
 * All or nothing on purpose: generate_sessions refuses when any session
 * exists, and removing them one at a time to get back to an empty class would
 * be worse than one deliberate button. Registers go with them, which is why it
 * refuses once any have been taken.
 */
export async function clearSessions(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  if (!(await graderViewer(classId))) denied();

  const supabase = await createClient();

  const { count } = await supabase
    .from("attendance")
    .select("id, class_sessions!inner ( class_id )", { count: "exact", head: true })
    .eq("class_sessions.class_id", classId);

  if ((count ?? 0) > 0) return;

  await supabase.from("class_sessions").delete().eq("class_id", classId);

  refresh(classId);
}
