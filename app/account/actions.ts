"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/account";
import { NOT_ALLOWED } from "@/lib/guard";
import { cleanName } from "@/lib/names";
import { createClient } from "@/lib/supabase/server";

export type NameState = { error?: string; ok?: string } | null;

/**
 * A signed-in person setting their own name.
 *
 * Written with their own client, so the `people_update_self` policy decides
 * which row they may touch — their own, and nobody else's. The update asks for
 * the row back because RLS refuses silently: a filtered-out update affects
 * nothing and raises nothing, and "saved" would be a lie.
 */
export async function saveMyName(_prev: NameState, formData: FormData): Promise<NameState> {
  const viewer = await getViewer();
  if (!viewer?.personId) return { error: NOT_ALLOWED };

  const first = cleanName(formData.get("firstName"), "First name");
  if ("error" in first) return first;
  const last = cleanName(formData.get("lastName"), "Last name");
  if ("error" in last) return last;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .update({ first_name: first.ok, last_name: last.ok })
    .eq("id", viewer.personId)
    .select("id");

  if (error) return { error: "That didn't save. Please try again." };
  if (!data?.length) return { error: NOT_ALLOWED };

  // The name appears in the header, the portal, and the registration page.
  revalidatePath("/", "layout");
  return { ok: "Thank you — saved." };
}
