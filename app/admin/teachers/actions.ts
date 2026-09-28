"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, adminViewer, denied } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type TeacherState = { error?: string; ok?: string } | null;

function refresh() {
  revalidatePath("/admin/teachers");
  revalidatePath("/admin/courses");
  revalidatePath("/courses");
  revalidatePath("/");
}

const teacherForm = z.object({
  firstName: z.string().trim().min(1, "A first name is required").max(100),
  lastName: z.string().trim().min(1, "A last name is required").max(100),
  title: z.string().trim().max(20).optional(),
  email: z.union([z.literal(""), z.email("That is not a valid email address")]),
  bio: z.string().trim().max(2000).optional(),
});

export async function saveTeacher(
  _prev: TeacherState,
  formData: FormData,
): Promise<TeacherState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const parsed = teacherForm.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    title: formData.get("title") ?? "",
    email: String(formData.get("email") ?? "").trim(),
    bio: formData.get("bio") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const teacherId = String(formData.get("teacherId") ?? "") || undefined;

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_teacher", {
    p_teacher_id: teacherId,
    p_title: parsed.data.title || undefined,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_email: parsed.data.email || undefined,
    p_bio: parsed.data.bio || undefined,
    p_is_active: formData.get("isActive") === "on",
  });

  if (error) {
    // people_email_unique fires when the address belongs to somebody who is
    // already a teacher; save_teacher raises its own message for that case.
    if (error.code === "23505" && error.message.includes("people_email_unique")) {
      return { error: "Someone else already has that email address." };
    }
    return { error: error.message };
  }

  refresh();
  return {
    ok: teacherId
      ? "Saved."
      : parsed.data.email
        ? "Teacher added. They will reach their gradebook by signing in with that address."
        : "Teacher added. Add their email when you have it, so they can sign in.",
  };
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Replaces an instructor's photograph.
 *
 * The object name is derived from the teacher id rather than the uploaded
 * filename: two teachers with a photo called "profile.jpg" would otherwise
 * collide, and a filename from a browser is untrusted input that ends up in a
 * public URL.
 */
export async function uploadTeacherPhoto(
  _prev: TeacherState,
  formData: FormData,
): Promise<TeacherState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const teacherId = String(formData.get("teacherId") ?? "");
  const file = formData.get("photo");

  if (!teacherId) return { error: "Missing teacher." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photograph." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That image is larger than 5MB." };
  if (!PHOTO_TYPES.has(file.type)) {
    return { error: "Photographs must be JPEG, PNG or WebP." };
  }

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${teacherId}.${extension}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from("teacher-photos")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) return { error: uploadError.message };

  const { error } = await supabase
    .from("teachers")
    .update({ photo_path: path })
    .eq("id", teacherId);

  if (error) return { error: error.message };

  refresh();
  return { ok: "Photograph updated." };
}

export async function removeTeacherPhoto(formData: FormData) {
  if (!(await adminViewer())) denied();

  const teacherId = String(formData.get("teacherId") ?? "");
  if (!teacherId) return;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("teachers")
    .select("photo_path")
    .eq("id", teacherId)
    .maybeSingle();

  await supabase.from("teachers").update({ photo_path: null }).eq("id", teacherId);

  // The row is what the site reads, so clear it first and treat the file as
  // tidying up. A failed delete leaves an orphan in the bucket, not a broken
  // page.
  if (row?.photo_path) {
    await supabase.storage.from("teacher-photos").remove([row.photo_path]);
  }

  refresh();
}
