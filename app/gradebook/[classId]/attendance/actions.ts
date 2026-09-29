"use server";

import { revalidatePath } from "next/cache";
import { NOT_ALLOWED, graderViewer } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type RegisterState = { error?: string; saved?: number } | null;

/** Register inputs are named `a:<enrollmentId>`. */
const CELL = /^a:([0-9a-f-]{36})$/;

const STATUSES = new Set(["present", "absent", "late", "excused"]);

/**
 * Records the register for one session.
 *
 * Against a session, not a typed date: a slip used to invent a meeting that
 * existed for one student and quietly lowered their attendance grade.
 *
 * Marking is all-or-nothing per session: every enrolled student gets a row, so
 * "no row" always means "the register was not taken", never "we forgot this
 * person". The attendance grade depends on that distinction — a missing row is
 * invisible to the calculation, while an absent row counts as zero.
 */
export async function saveRegister(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const classId = String(formData.get("classId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  if (!classId) return { error: "Missing class." };
  if (!sessionId) return { error: "Choose a session." };

  const viewer = await graderViewer(classId);
  if (!viewer) return { error: NOT_ALLOWED };

  const supabase = await createClient();

  // The session must belong to this class. Without this check a crafted
  // request could mark a register against another course's meeting — RLS would
  // allow it, because the caller may well teach both.
  const { data: session } = await supabase
    .from("class_sessions")
    .select("id, is_cancelled")
    .eq("id", sessionId)
    .eq("class_id", classId)
    .maybeSingle();

  if (!session) return { error: "That session is not part of this class." };
  if (session.is_cancelled) {
    return { error: "That session is cancelled. Un-cancel it before taking a register." };
  }

  const rows: {
    enrollment_id: string;
    session_id: string;
    class_id: string;
    status: string;
    recorded_by: string | null;
  }[] = [];

  for (const [key, raw] of formData.entries()) {
    const match = CELL.exec(key);
    if (!match) continue;

    const status = String(raw);
    if (status === "") continue; // left blank — not recorded for this student
    if (!STATUSES.has(status)) return { error: `"${status}" is not a valid status.` };

    rows.push({
      enrollment_id: match[1],
      session_id: sessionId,
      // Carried so both foreign keys agree on one class — see the composite
      // keys on attendance. A register cannot cross courses.
      class_id: classId,
      status,
      recorded_by: viewer.personId,
    });
  }

  if (rows.length === 0) return { error: "Nobody was marked." };

  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "enrollment_id,session_id" });

  if (error) return { error: error.message };

  revalidatePath(`/gradebook/${classId}/attendance`);
  revalidatePath(`/gradebook/${classId}`);
  return { saved: rows.length };
}
