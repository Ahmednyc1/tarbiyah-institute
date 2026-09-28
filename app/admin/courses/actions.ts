"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, adminViewer } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type CatalogueState = { error?: string; ok?: string } | null;

function refresh() {
  revalidatePath("/admin/courses");
  revalidatePath("/admin");
  revalidatePath("/courses");
  revalidatePath("/");
}

/** Postgres speaks in constraint names; the desk needs sentences. */
function explain(error: { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (error.message.includes("courses_code_key")) return "That course code is already in use.";
    if (error.message.includes("classes_unique_offering")) {
      return "A run of this course already exists for that term.";
    }
    return "That already exists.";
  }
  return error.message;
}

const courseForm = z.object({
  code: z.string().trim().min(2, "A course code is required").max(20),
  title: z.string().trim().min(2, "A title is required").max(200),
  term: z.string().trim().min(2, "A term is required — Fall 2026, Ramadan 1448").max(60),
  teacherId: z.uuid("Choose a teacher"),
  fee: z.coerce.number().min(0, "The fee cannot be negative"),
});

/**
 * One form, both rows.
 *
 * `courses` and `classes` are still two tables, but nothing in the interface
 * says so — see save_course. A missing courseId means create.
 */
export async function saveCourse(
  _prev: CatalogueState,
  formData: FormData,
): Promise<CatalogueState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const parsed = courseForm.safeParse({
    code: formData.get("code"),
    title: formData.get("title"),
    term: formData.get("term"),
    teacherId: formData.get("teacherId"),
    fee: formData.get("fee"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const courseId = String(formData.get("courseId") ?? "") || undefined;
  const classId = String(formData.get("classId") ?? "") || undefined;
  const capacity = String(formData.get("capacity") ?? "").trim();

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_course", {
    p_course_id: courseId,
    p_class_id: classId,
    p_code: parsed.data.code,
    p_title: parsed.data.title,
    p_description: String(formData.get("description") ?? ""),
    p_is_active: formData.get("isActive") === "on",
    p_term: parsed.data.term,
    p_teacher_id: parsed.data.teacherId,
    p_fee: parsed.data.fee,
    // Blank means no limit, which is not the same as zero.
    p_capacity: capacity ? Number(capacity) : undefined,
    p_schedule: String(formData.get("schedule") ?? ""),
    p_location: String(formData.get("location") ?? ""),
    p_start: String(formData.get("startDate") ?? "") || undefined,
    p_end: String(formData.get("endDate") ?? "") || undefined,
  });

  if (error) return { error: explain(error) };

  refresh();
  return {
    ok: courseId
      ? "Saved."
      : "Course created as a draft. Set its grading scheme, then publish it.",
  };
}

export async function setCourseStatus(
  _prev: CatalogueState,
  formData: FormData,
): Promise<CatalogueState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const classId = String(formData.get("classId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!classId) return { error: "This course has no details saved yet." };
  if (!["draft", "open", "in_progress", "completed", "cancelled"].includes(status)) {
    return { error: "Unknown status." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("classes").update({ status }).eq("id", classId);

  // The weights trigger raises here when a course is published without a
  // grading scheme totalling 100. Its own message already says what to do.
  if (error) return { error: error.message };

  refresh();
  revalidatePath(`/admin/classes/${classId}`);
  return { ok: `Now ${status.replace("_", " ")}.` };
}

/** Only possible while nobody has enrolled — see delete_course. */
export async function deleteCourse(
  _prev: CatalogueState,
  formData: FormData,
): Promise<CatalogueState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const courseId = String(formData.get("courseId") ?? "");
  if (!courseId) return { error: "Missing course." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_course", { p_course_id: courseId });
  if (error) return { error: error.message };

  refresh();
  return { ok: "Course deleted." };
}
