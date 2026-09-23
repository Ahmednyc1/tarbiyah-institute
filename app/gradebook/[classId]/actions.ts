"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; saved?: number } | null;

/** Grid inputs are named `s:<enrollmentId>:<assignmentId>`. */
const CELL = /^s:([0-9a-f-]{36}):([0-9a-f-]{36})$/;

/**
 * Saves every changed cell in one go.
 *
 * Writes go through the caller's own client, so RLS decides what may be
 * written — a teacher can only mark their own class, whatever the form posts.
 */
export async function saveGrades(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const classId = String(formData.get("classId") ?? "");
  if (!classId) return { error: "Missing class." };

  const viewer = await getViewer();
  if (!viewer) return { error: "You are not signed in." };

  const supabase = await createClient();

  const rows: {
    class_id: string;
    enrollment_id: string;
    assignment_id: string;
    score: number | null;
    graded_at: string | null;
    graded_by: string | null;
  }[] = [];

  for (const [key, raw] of formData.entries()) {
    const match = CELL.exec(key);
    if (!match) continue;

    const value = String(raw).trim();

    // Empty means "not marked yet", which is deliberately distinct from 0 —
    // a zero is a mark, and averaging them differently is the whole reason
    // student_grades.score is nullable.
    const score = value === "" ? null : Number(value);
    if (score !== null && (!Number.isFinite(score) || score < 0)) {
      return { error: `"${value}" is not a valid mark.` };
    }

    rows.push({
      class_id: classId,
      enrollment_id: match[1],
      assignment_id: match[2],
      score,
      graded_at: score === null ? null : new Date().toISOString(),
      // Null when an admin who is not a teacher marks something — graded_by
      // references teachers, so there is no value that can represent them.
      graded_by: score === null ? null : viewer.teacherId,
    });
  }

  if (rows.length === 0) return { saved: 0 };

  const { error } = await supabase
    .from("student_grades")
    .upsert(rows, { onConflict: "enrollment_id,assignment_id" });

  if (error) {
    // The score-vs-max_score trigger raises here, among others.
    return { error: error.message };
  }

  revalidatePath(`/gradebook/${classId}`);
  return { saved: rows.length };
}
