/**
 * People's names, and the placeholder that stands in for a missing one.
 *
 * The sign-up trigger copies a name from Google. When the Google account has
 * a one-word name — "Aisha", with no family name — there is no last name to
 * copy, and the database stores the literal 'Pending' in its place. Nothing
 * ever replaced it: registration never asked. On 15 Nov 2026 twelve people
 * had it, and a certificate would have printed "Aisha Pending".
 *
 * The word stays in the database for now (the column is NOT NULL, and
 * changing the trigger is a database change). This file is where the
 * application agrees to treat it as "no name", so it is never shown and the
 * student is asked for the real one.
 */

export const NAME_PLACEHOLDER = "Pending";

type NameParts = {
  title?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** The name part as a person would want it shown, or null if it is missing. */
export function realName(part: string | null | undefined): string | null {
  const trimmed = part?.trim();
  if (!trimmed || trimmed.toLowerCase() === NAME_PLACEHOLDER.toLowerCase()) return null;
  return trimmed;
}

/** "Sh Mohammad Badawy", "Aisha" — never "Aisha Pending". */
export function fullName(person: NameParts | null | undefined, fallback = "Unknown"): string {
  if (!person) return fallback;
  const parts = [person.title?.trim(), realName(person.first_name), realName(person.last_name)];
  return parts.filter(Boolean).join(" ") || fallback;
}

/** Whether this person still owes us a first or last name. */
export function needsFullName(person: NameParts | null | undefined): boolean {
  return Boolean(person) && (!realName(person?.first_name) || !realName(person?.last_name));
}

/**
 * Checks a name somebody typed. Returns the cleaned value, or a sentence to
 * show them. Used by the student's own form and the admin's roster edit, so
 * both refuse the same things.
 */
export function cleanName(
  value: FormDataEntryValue | null,
  label: "First name" | "Last name",
): { ok: string } | { error: string } {
  const trimmed = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { error: `${label} is required.` };
  if (trimmed.length > 60) return { error: `${label} is too long.` };
  if (!realName(trimmed)) return { error: `Please enter your real ${label.toLowerCase()}.` };
  return { ok: trimmed };
}
