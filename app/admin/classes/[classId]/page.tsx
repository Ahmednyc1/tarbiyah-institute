import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddStudentPanel } from "@/components/add-student-panel";
import { RosterRow } from "@/components/roster-row";
import { formatFee } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Roster" };

export default async function RosterPage({
  params,
  searchParams,
}: PageProps<"/admin/classes/[classId]">) {
  const { classId } = await params;
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select(
      `id, term, section, status, capacity, registration_fee, meeting_schedule,
       courses ( code, title ), teacher_directory ( full_name )`,
    )
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [rosterRes, availabilityRes] = await Promise.all([
    supabase
      .from("enrollments")
      .select(
        `id, status, amount_due, amount_paid, payment_status, waiver_note, enrolled_at,
         students ( id, student_number, people ( id, title, first_name, last_name, email, phone, email_confirmed_at, auth_user_id ) )`,
      )
      .eq("class_id", classId)
      .order("enrolled_at"),
    supabase
      .from("class_availability")
      .select("taken, remaining, is_full")
      .eq("class_id", classId)
      .maybeSingle(),
  ]);

  const roster = rosterRes.data ?? [];
  const enrolledPersonIds = new Set(
    roster.map((r) => r.students?.people?.id).filter((id): id is string => Boolean(id)),
  );

  // Only search when asked — an unfiltered list of everyone is noise, and on a
  // real roll it would be a lot of rows.
  let candidates: { id: string; label: string; detail: string }[] = [];
  if (search.length >= 2) {
    const term = `%${search}%`;
    const { data } = await supabase
      .from("people")
      .select("id, title, first_name, last_name, email")
      .or(`first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term}`)
      .limit(20);

    candidates = (data ?? [])
      .filter((p) => !enrolledPersonIds.has(p.id))
      .map((p) => ({
        id: p.id,
        label: [p.title, p.first_name, p.last_name].filter(Boolean).join(" "),
        detail: p.email ?? "no email on file",
      }));
  }

  const nameOf = (r: (typeof roster)[number]) =>
    `${r.students?.people?.last_name ?? "zzz"} ${r.students?.people?.first_name ?? ""}`;
  const sorted = [...roster].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  // Dropped students leave the roll but keep their record — their marks and
  // attendance still exist, and deleting the enrollment would cascade those
  // away. They sit in their own section instead of cluttering the roster.
  const active = sorted.filter((r) => r.status !== "dropped");
  const droppedRows = sorted.filter((r) => r.status === "dropped");

  const owed = roster
    .filter((r) => r.status !== "dropped")
    .reduce((sum, r) => sum + Math.max(0, Number(r.amount_due) - Number(r.amount_paid)), 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Admin
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code} · Roster</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{cls.courses?.title}</h1>
      <p className="mt-3 text-muted-foreground">
        {cls.term}
        {cls.section ? ` · ${cls.section}` : ""}
        {cls.meeting_schedule ? ` · ${cls.meeting_schedule}` : ""}
        {cls.teacher_directory ? ` · ${cls.teacher_directory.full_name}` : ""}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Badge variant="secondary">
          {availabilityRes.data?.taken ?? 0}
          {cls.capacity !== null ? ` of ${cls.capacity}` : ""} enrolled
        </Badge>
        {availabilityRes.data?.is_full ? <Badge variant="destructive">Full</Badge> : null}
        <Badge variant="secondary">Fee {formatFee(Number(cls.registration_fee))}</Badge>
        {owed > 0 ? (
          <Badge variant="destructive">{formatFee(owed)} outstanding</Badge>
        ) : (
          <Badge>All paid</Badge>
        )}
      </div>

      {/* ---- Add someone ---- */}
      <h2 className="mt-12 font-display text-3xl text-primary">Enrol a student</h2>
      <p className="mt-2 text-foreground/75">
        Someone paid at the desk? Find them if they already have a record, or add them from
        scratch if they have never been here before.
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[16rem] flex-1 space-y-1.5">
          <label htmlFor="q" className="text-xs uppercase tracking-wider text-muted-foreground">
            Search by name or email
          </label>
          <Input id="q" name="q" defaultValue={search} placeholder="Yusra, or yusra@…" />
        </div>
        <Button type="submit" variant="outline">
          <Search className="mr-1.5 h-4 w-4" />
          Search
        </Button>
      </form>

      <AddStudentPanel
        classId={classId}
        search={search}
        candidates={candidates}
        isFull={availabilityRes.data?.is_full ?? false}
      />

      {/* ---- The roster ---- */}
      <h2 className="mt-14 font-display text-3xl text-primary">On the roll</h2>

      {active.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Nobody is enrolled yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {active.map((row) => {
            const person = row.students?.people;
            return (
              <RosterRow
                key={row.id}
                classId={classId}
                enrollmentId={row.id}
                name={
                  person
                    ? [person.title, person.first_name, person.last_name].filter(Boolean).join(" ")
                    : "Unknown"
                }
                studentNumber={row.students?.student_number ?? ""}
                contact={person?.email ?? person?.phone ?? null}
                personId={person?.id ?? null}
                emailUnconfirmed={Boolean(
                  person?.email && !person.email_confirmed_at && !person.auth_user_id,
                )}
                status={row.status}
                amountDue={Number(row.amount_due)}
                amountPaid={Number(row.amount_paid)}
                paymentStatus={row.payment_status}
                waiverNote={row.waiver_note}
              />
            );
          })}
        </ul>
      )}

      {droppedRows.length > 0 ? (
        <details className="mt-10">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {droppedRows.length} dropped from this class
          </summary>
          <ul className="mt-4 space-y-3">
            {droppedRows.map((row) => {
              const person = row.students?.people;
              return (
                <RosterRow
                  key={row.id}
                  classId={classId}
                  enrollmentId={row.id}
                  name={
                    person
                      ? [person.title, person.first_name, person.last_name]
                          .filter(Boolean)
                          .join(" ")
                      : "Unknown"
                  }
                  studentNumber={row.students?.student_number ?? ""}
                  contact={person?.email ?? person?.phone ?? null}
                personId={person?.id ?? null}
                emailUnconfirmed={Boolean(
                  person?.email && !person.email_confirmed_at && !person.auth_user_id,
                )}
                  status={row.status}
                  amountDue={Number(row.amount_due)}
                  amountPaid={Number(row.amount_paid)}
                  paymentStatus={row.payment_status}
                  waiverNote={row.waiver_note}
                />
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Their marks and attendance are kept. Re-enrol puts them back on the roll if there is a
            seat.
          </p>
        </details>
      ) : null}
    </div>
  );
}
