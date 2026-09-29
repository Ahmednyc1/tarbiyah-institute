"use server";

import { revalidatePath } from "next/cache";
import { NOT_ALLOWED, graderViewer } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type RegisterState = { error?: string; saved?: number; date?: string } | null;

/** Register inputs are named `a:<enrollmentId>`. */
const CELL = /^a:([0-9a-f-]{36})$/;

const STATUSES = new Set(["present", "absent", "late", "excused"]);

/**
 * Records the register for one date.
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
  const classDate = String(formData.get("classDate") ?? "");

  if (!classId) return { error: "Missing class." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(classDate)) return { error: "Choose a valid date." };

  const viewer = await graderViewer(classId);
  if (!viewer) return { error: NOT_ALLOWED };

  const supabase = await createClient();

  const rows: {
    enrollment_id: string;
    class_date: string;
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
      class_date: classDate,
      status,
      recorded_by: viewer.personId,
    });
  }

  if (rows.length === 0) return { error: "Nobody was marked." };

  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "enrollment_id,class_date" });

  if (error) return { error: error.message };

  revalidatePath(`/gradebook/${classId}/attendance`);
  revalidatePath(`/gradebook/${classId}`);
  return { saved: rows.length, date: classDate };
}
