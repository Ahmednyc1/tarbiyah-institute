import { createClient } from "@/lib/supabase/server";

/**
 * The public catalogue.
 *
 * Shape note: a `course` is the catalogue entry ("Fiqh of Fasting" exists as a
 * thing we teach); a `class` is one offering of it (this teacher, this term,
 * this roster). A course with no class is real but not currently scheduled —
 * RLS also hides draft and cancelled classes from anonymous visitors, so an
 * empty `classes` array means "nothing to register for right now" either way.
 */

export type CatalogueClass = {
  id: string;
  term: string;
  status: string;
  registration_fee: number;
  capacity: number | null;
  meeting_schedule: string | null;
  location: string | null;
  gender_restriction: string;
  teacher: { full_name: string } | null;
};

export type CatalogueCourse = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  classes: CatalogueClass[];
};

export async function getCatalogue(): Promise<CatalogueCourse[]> {
  const supabase = await createClient();

  // `teacher_directory` is a view, but PostgREST traces its `id` back to
  // teachers.id and embeds it through classes.teacher_id — so this is one
  // round trip, not two.
  const { data, error } = await supabase
    .from("courses")
    .select(
      `id, code, title, description,
       classes (
         id, term, status, registration_fee, capacity,
         meeting_schedule, location, gender_restriction,
         teacher:teacher_directory ( full_name )
       )`,
    )
    .eq("is_active", true)
    .order("code");

  if (error) throw error;

  // Courses you can actually register for lead the page; unscheduled ones fall
  // to the end. `code` order is the tiebreak, so the listing stays stable.
  return ((data ?? []) as unknown as CatalogueCourse[]).sort((a, b) => {
    const rank = (c: CatalogueCourse) => (openClassOf(c)?.status === "open" ? 0 : 1);
    return rank(a) - rank(b) || a.code.localeCompare(b.code);
  });
}

/**
 * The offering worth putting on a catalogue card, if there is one.
 *
 * A course the institute has finished teaching has no current offering, even
 * though the finished class is still sitting in `course.classes`. Its price,
 * schedule and seat count all describe a term that is over, and showing them
 * invites somebody to plan around details that will change before it runs
 * again.
 *
 * THE STATUS LIST IS NOT OPTIONAL HERE, and this is the second time that has
 * bitten. RLS already shows the public `open` and `in_progress` only, so
 * falling back to `classes[0]` happened to do the right thing — for everybody
 * except an admin, who can see every class and therefore saw a different
 * catalogue from the one visitors saw. A page that reads differently depending
 * on who is signed in is a page nobody can check.
 */
const BOOKABLE = ["open", "in_progress"] as const;

export const openClassOf = (course: CatalogueCourse) =>
  course.classes.find((c) => c.status === "open") ??
  course.classes.find((c) => (BOOKABLE as readonly string[]).includes(c.status)) ??
  null;
