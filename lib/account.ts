import { fullName, needsFullName, realName } from "@/lib/names";
import { createClient } from "@/lib/supabase/server";

export type Viewer = {
  userId: string;
  email: string | null;
  personId: string | null;
  displayName: string;
  /** Their own first and last name, blank where missing — for pre-filling a form. */
  firstName: string;
  lastName: string;
  /** True while the record still lacks a real first or last name. */
  needsFullName: boolean;
  /**
   * Roles draw the UI, and gate Server Actions through lib/guard — but they
   * are never the only thing standing in the way. RLS re-checks every query in
   * the database, which is what actually protects the data; a role read here
   * could only ever be a second lock, because it is decided in the same
   * process that is asking.
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

  const displayName = person ? fullName(person, user.email ?? "Account") : (user.email ?? "Account");

  return {
    userId: user.id,
    email: user.email ?? null,
    personId: person?.id ?? null,
    displayName,
    firstName: realName(person?.first_name) ?? "",
    lastName: realName(person?.last_name) ?? "",
    needsFullName: needsFullName(person),
    isAdmin: roles?.is_admin ?? false,
    teacherId: roles?.teacher_id ?? null,
    studentId: roles?.student_id ?? null,
  };
}
