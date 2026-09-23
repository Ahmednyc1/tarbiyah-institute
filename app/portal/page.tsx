import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { formatFee } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Student portal",
  description: "Your enrollments, schedules and course records.",
};

export default async function PortalPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth?next=/portal");

  const supabase = await createClient();

  // Filter on student_id explicitly. RLS sets the ceiling on what a caller MAY
  // read, not what this page should ask for — an admin matches
  // `enrollments_admin_all` and would otherwise get every enrollment in the
  // institute rendered as their own courses.
  //
  // No students row means the person has an account but has never enrolled,
  // which is the normal state for a new sign-up.
  const rows = viewer.studentId
    ? ((
        await supabase
          .from("enrollments")
          .select(
            `id, status, payment_status, amount_due, amount_paid,
             classes ( term, meeting_schedule, location,
                       courses ( code, title ) )`,
          )
          .eq("student_id", viewer.studentId)
          .order("enrolled_at", { ascending: false })
      ).data ?? [])
    : [];

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="eyebrow">Student portal</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{viewer.displayName}</h1>
      {viewer.email ? <p className="mt-2 text-muted-foreground">{viewer.email}</p> : null}

      {viewer.personId === null ? (
        <p className="mt-8 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          Your account exists but has no profile record. Please contact the institute — this needs
          an administrator to fix.
        </p>
      ) : null}

      <h2 className="mt-12 font-display text-3xl text-primary">Your courses</h2>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-8 text-center shadow-card">
          <p className="text-foreground/75">You are not enrolled in any courses yet.</p>
          <Button asChild className="mt-5 bg-gold text-gold-foreground hover:bg-gold/90">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((row) => {
            const offering = row.classes;
            const course = offering?.courses;
            const outstanding = Number(row.amount_due) - Number(row.amount_paid);

            return (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-card p-6 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl text-primary">
                      <Link
                        href={`/portal/${row.id}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {course?.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {offering?.meeting_schedule ?? offering?.term}
                      {offering?.location ? ` · ${offering.location}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {row.status}
                    </Badge>
                    <Badge
                      variant={row.payment_status === "paid" ? "default" : "destructive"}
                      className="capitalize"
                    >
                      {row.payment_status}
                    </Badge>
                  </div>
                </div>

                {outstanding > 0 ? (
                  <p className="mt-4 text-sm text-foreground/75">
                    Outstanding balance: {formatFee(outstanding)}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
