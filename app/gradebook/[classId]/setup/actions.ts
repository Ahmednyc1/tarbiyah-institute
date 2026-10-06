"use server";

import { revalidatePath } from "next/cache";
import { notifyAssignmentPublished } from "@/lib/emails/notify-class";
import { NOT_ALLOWED, denied, graderViewer } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type SchemeState = { error?: string; saved?: boolean } | null;

function refresh(classId: string) {
  revalidatePath(`/gradebook/${classId}/setup`);
  revalidatePath(`/gradebook/${classId}`);
}

/**
 * Replaces the whole grading scheme.
 *
 * Goes through the set_grade_categories RPC rather than individual writes so
 * the weights-sum-to-100 check runs once, at commit. Saving row by row would
 * fail the moment a running total passed through 95.
 */
export async function saveScheme(_prev: SchemeState, formData: FormData): Promise<SchemeState> {
  const classId = String(formData.get("classId") ?? "");
  if (!classId) return { error: "Missing class." };
  if (!(await graderViewer(classId))) return { error: NOT_ALLOWED };

  let categories: unknown;
  try {
    categories = JSON.parse(String(formData.get("categories") ?? "[]"));
  } catch {
    return { error: "Could not read the scheme." };
  }

  if (!Array.isArray(categories) || categories.length === 0) {
    return { error: "Add at least one category." };
  }

  for (const c of categories as { name?: string; weight?: number }[]) {
    if (!c.name?.trim()) return { error: "Every category needs a name." };
    if (!Number.isFinite(c.weight) || c.weight! <= 0 || c.weight! > 100) {
      return { error: `"${c.name}" needs a weight between 1 and 100.` };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_grade_categories", {
    p_class_id: classId,
    p_categories: categories as never,
  });

  // The weights trigger surfaces here with its own wording.
  if (error) return { error: error.message };

  refresh(classId);
  return { saved: true };
}

export async function createAssignment(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const maxScore = Number(formData.get("maxScore"));
  const dueDate = String(formData.get("dueDate") ?? "");

  if (!classId || !categoryId || !name || !Number.isFinite(maxScore) || maxScore <= 0) return;

  if (!(await graderViewer(classId))) denied();

  const supabase = await createClient();
  await supabase.from("assignments").insert({
    class_id: classId,
    grade_category_id: categoryId,
    name,
    max_score: maxScore,
    due_date: dueDate || null,
    is_published: formData.get("isPublished") === "on",
  });

  refresh(classId);
}

export async function updateAssignment(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const id = String(formData.get("assignmentId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const maxScore = Number(formData.get("maxScore"));
  const dueDate = String(formData.get("dueDate") ?? "");

  if (!classId || !id || !name || !Number.isFinite(maxScore) || maxScore <= 0) return;

  if (!(await graderViewer(classId))) denied();

  const publishing = formData.get("isPublished") === "on";

  const supabase = await createClient();
  await supabase
    .from("assignments")
    .update({
      name,
      max_score: maxScore,
      due_date: dueDate || null,
      is_published: publishing,
    })
    .eq("id", id);

  refresh(classId);

  // Only from here, never from createAssignment: an assignment can be created
  // already published, with nothing marked on it, and "your mark is up" would
  // be a lie. Notifying is also not gated on a published/unpublished crossing
  // the way sessions are — a teacher who publishes with half the class marked
  // and finishes on Tuesday should be able to tell the rest by saving again,
  // and notifyAssignmentPublished skips whoever has already been told.
  if (publishing) {
    await notifyAssignmentPublished(classId, id);
  }
}

export async function deleteAssignment(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const id = String(formData.get("assignmentId") ?? "");
  if (!classId || !id) return;

  if (!(await graderViewer(classId))) denied();

  // student_grades cascade from the assignment, so this destroys any marks
  // already entered against it. The UI says so before you click.
  const supabase = await createClient();
  await supabase.from("assignments").delete().eq("id", id);

  refresh(classId);
}

/** The two numeric policies that govern how a class is graded. */
export async function updateClassPolicy(formData: FormData) {
  const classId = String(formData.get("classId") ?? "");
  const passingScore = Number(formData.get("passingScore"));
  const grace = Number(formData.get("attendanceGrace"));

  if (!classId) return;
  if (!Number.isFinite(passingScore) || passingScore < 0 || passingScore > 100) return;
  if (!Number.isInteger(grace) || grace < 0) return;

  if (!(await graderViewer(classId))) denied();

  const supabase = await createClient();
  await supabase
    .from("classes")
    .update({ passing_score: passingScore, attendance_grace: grace })
    .eq("id", classId);

  refresh(classId);
}
