import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string | null;
  personId: string | null;
  displayName: string;
  /**
   * Roles are for drawing the UI only. Never gate data on them — RLS re-checks
   * every query in the database, which is what actually protects anything.
   */
  isAdmin: boolean;
  teacherId: string | null;
  studentId: string | null;
};

/**
 * The signed-in person and what they are, or null.
 *
 * `my_roles` re-exports the same helpers RLS uses, so there is no second
 * definition of "admin" that could drift from the one enforcing access.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient();

  // getUser() revalidates the token with Supabase. getSession() would trust a
  // cookie the browser could have forged, so it must not be used on the server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: person }, { data: roles }] = await Promise.all([
    supabase
      .from("people")
      .select("id, title, first_name, last_name")
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase.from("my_roles").select("is_admin, teacher_id, student_id").maybeSingle(),
  ]);

  const displayName = person
    ? [person.title, person.first_name, person.last_name].filter(Boolean).join(" ")
    : (user.email ?? "Account");

  return {
    userId: user.id,
    email: user.email ?? null,
    personId: person?.id ?? null,
    displayName,
    isAdmin: roles?.is_admin ?? false,
    teacherId: roles?.teacher_id ?? null,
    studentId: roles?.student_id ?? null,
  };
}
