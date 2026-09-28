"use server";

import { promises as dns } from "node:dns";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ALLOWED, adminViewer, denied } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";

export type RosterState = {
  error?: string;
  ok?: string;
  /** The domain has no mail servers — let the desk confirm before saving. */
  emailWarning?: string;
  /** Echoed back so the form can refill: React 19 resets a form after its action. */
  values?: { firstName: string; lastName: string; email: string; phone: string };
} | null;

/**
 * Does this domain accept mail at all?
 *
 * Catches the typo that matters — telestackrx1.com, gmial.com — without
 * pretending to verify the mailbox. Nothing short of sending can prove an
 * address exists: servers accept-then-bounce, and most refuse probes. A
 * missing MX is therefore a warning the desk can override, not a hard block;
 * someone standing at the counter should not be stopped by a DNS quirk.
 */
async function domainAcceptsMail(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

function refresh(classId: string) {
  // Both forms on purpose. The concrete path alone did not reliably refresh a
  // dynamically rendered route, so the route pattern is invalidated as well.
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/classes/[classId]", "page");
  revalidatePath(`/gradebook/${classId}`);
  revalidatePath("/admin");
}

/**
 * One call, one transaction. Postgres maps its errors to wording the desk can
 * act on; anything unrecognised is passed through rather than swallowed.
 */
async function callEnrol(
  args: Record<string, string | null>,
  values?: NonNullable<RosterState>["values"],
): Promise<RosterState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enrol_person", args as never);

  if (error) {
    if (error.code === "23505") {
      // Two different unique constraints land here and mean opposite things.
      if (error.message.includes("people_email_unique")) {
        return { error: "Someone already has that email address.", values };
      }
      return { error: "That person is already on this roster.", values };
    }
    return { error: error.message, values };
  }

  return { ok: "Student enrolled." };
}

export async function enrollExistingPerson(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const classId = String(formData.get("classId") ?? "");
  const personId = String(formData.get("personId") ?? "");
  if (!classId || !personId) return { error: "Pick someone to enrol." };

  const result = await callEnrol({ p_class_id: classId, p_person_id: personId });
  if (result?.ok) refresh(classId);
  return result;
}

export async function enrollNewPerson(
  _prev: RosterState,
  formData: FormData,
): Promise<RosterState> {
  if (!(await adminViewer())) return { error: NOT_ALLOWED };

  const classId = String(formData.get("classId") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const values = { firstName, lastName, email, phone };

  if (!classId) return { error: "Missing class." };
  if (!firstName || !lastName) {
    return { error: "First and last name are required.", values };
  }

  if (email) {
    if (!z.email().safeParse(email).success) {
      return { error: `"${email}" is not a valid email address.`, values };
    }

    // An existing owner of this address is the likeliest reason a create
    // fails, and the constraint name alone cannot say who or what to do next.
    const supabase = await createClient();
    const { data: existing } = await supabase
      .from("people")
      .select("id, title, first_name, last_name")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      const who = [existing.title, existing.first_name, existing.last_name]
        .filter(Boolean)
        .join(" ");

      const { data: already } = await supabase
        .from("enrollments")
        .select("status, students!inner ( person_id )")
        .eq("class_id", classId)
        .eq("students.person_id", existing.id)
        .maybeSingle();

      if (already?.status === "dropped") {
        return {
          error: `${who} already has a record and was dropped from this course. Re-enrol them from the dropped list below rather than adding a second record.`,
          values,
        };
      }
      if (already) {
        return { error: `${who} is already on this roster.`, values };
      }
      return {
        error: `${email} already belongs to ${who}. Search for them above and enrol that record, so their history stays in one place.`,
        values,
      };
    }

    // Skipped once the desk has confirmed the address is right anyway.
    if (formData.get("confirmEmail") !== "1" && !(await domainAcceptsMail(email))) {
      return {
        emailWarning: `No mail server found for ${email.split("@")[1]} — check the spelling. If the address is right, add them anyway.`,
        values,
      };
    }
  }

  // An email is worth asking for even from a walk-in: handle_new_auth_user
  // claims this record if they ever sign in with it, instead of duplicating
  // them. Without one they simply stay an offline record.
  const result = await callEnrol(
    {
      p_class_id: classId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: email || null,
      p_phone: phone || null,
    },
    values,
  );

  if (result?.error?.includes("people_email_unique")) {
    return { error: "Someone with that email already exists — search for them instead.", values };
  }
  if (result?.ok) refresh(classId);
  return result;
}

/** Adds to what has already been paid, rather than replacing it. */
export async function recordPayment(formData: FormData) {
  if (!(await adminViewer())) denied();

  const classId = String(formData.get("classId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const amount = Number(formData.get("amount"));
  if (!classId || !enrollmentId || !Number.isFinite(amount) || amount <= 0) return;

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("enrollments")
    .select("amount_paid")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!row) return;

  // payment_status is maintained by the sync_payment_status trigger.
  await supabase
    .from("enrollments")
    .update({ amount_paid: Number(row.amount_paid) + amount })
    .eq("id", enrollmentId);

  refresh(classId);
}

export async function waiveFee(formData: FormData) {
  if (!(await adminViewer())) denied();

  const classId = String(formData.get("classId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const note = String(formData.get("waiverNote") ?? "").trim();
  if (!classId || !enrollmentId) return;

  const supabase = await createClient();
  // 'waived' is respected as a manual override by sync_payment_status, so it
  // will not be recalculated back to 'unpaid'.
  await supabase
    .from("enrollments")
    .update({ payment_status: "waived", waiver_note: note || null })
    .eq("id", enrollmentId);

  refresh(classId);
}

/** Dropping keeps the record and its history; it never deletes marks. */
export async function setEnrollmentStatus(formData: FormData) {
  if (!(await adminViewer())) denied();

  const classId = String(formData.get("classId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!classId || !enrollmentId) return;
  if (!["enrolled", "dropped", "completed", "failed"].includes(status)) return;

  const supabase = await createClient();
  await supabase.from("enrollments").update({ status }).eq("id", enrollmentId);

  refresh(classId);
}
