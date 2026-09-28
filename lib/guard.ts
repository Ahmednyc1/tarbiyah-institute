import { getViewer, type Viewer } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";

/**
 * Who may run a Server Action.
 *
 * A Server Action is a POST endpoint on the page that declares it. The layout
 * guards under /admin and /gradebook do NOT protect them: an action runs
 * before anything renders, so `notFound()` in a layout never fires for one.
 * Anyone who can send the POST reaches the function body.
 *
 * RLS is still the boundary that actually protects the data — every write
 * below goes through the caller's own Supabase client and is re-checked in the
 * database. These helpers are the second layer, and they exist for two
 * reasons:
 *
 *   1. RLS refuses *silently*. An UPDATE a policy filters out affects zero
 *      rows and raises nothing, so an unauthorised caller gets a cheerful
 *      "saved" and we get no signal. Failing here fails loudly.
 *   2. One missing policy should not be one missing policy away from a breach.
 *
 * Both return the viewer or null; the caller decides whether to say so politely
 * (a form that can render the message) or to throw (everything else).
 */

/** The wording for forms that have somewhere to put it. */
export const NOT_ALLOWED = "You do not have permission to do that.";

/** For actions with no return channel. Loud on purpose — see the module note. */
export function denied(): never {
  throw new Error(NOT_ALLOWED);
}

/** The signed-in viewer, but only if they administer the institute. */
export async function adminViewer(): Promise<Viewer | null> {
  const viewer = await getViewer();
  return viewer?.isAdmin ? viewer : null;
}

/**
 * The signed-in viewer, but only if they may grade this particular class.
 *
 * Admins may grade anything, matching the /gradebook layout. A teacher is
 * checked against the class they are actually posting to, so holding the
 * teacher role is not enough to mark somebody else's students.
 */
export async function graderViewer(classId: string): Promise<Viewer | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (viewer.isAdmin) return viewer;
  if (!viewer.teacherId || !classId) return null;

  // `classes` is readable by everyone signed in, so the row coming back proves
  // nothing on its own — the teacher_id comparison is what decides.
  const supabase = await createClient();
  const { data } = await supabase
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .maybeSingle();

  return data?.teacher_id === viewer.teacherId ? viewer : null;
}
