import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/account";
import { formatFee } from "@/lib/catalogue";
import { getReportCard, type ReportRow } from "@/lib/report-card";

export const metadata: Metadata = {
  title: "Student portal",
  description: "Your classes, grades and certificates.",
};

const pct = (value: number) => `${value.toFixed(1).replace(/\.0$/, "")}%`;

export default async function PortalPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth?next=/portal");

  // No students row means an account that has never enrolled — the normal
  // state for a new sign-up, and for staff who don't take classes.
  const rows = viewer.studentId ? await getReportCard(viewer.studentId) : [];

  const current = rows.filter((r) => !r.isFinal && r.status !== "dropped");
  const finished = rows.filter((r) => r.isFinal);
  const withdrawn = rows.filter((r) => r.status === "dropped");
  const passedCount = finished.filter((r) => r.passed).length;

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

      {rows.length === 0 ? (
        <div className="mt-12 rounded-lg border border-border bg-card p-8 text-center shadow-card">
          <p className="text-foreground/75">You are not enrolled in any courses yet.</p>
          <Button asChild className="mt-5 bg-gold text-gold-foreground hover:bg-gold/90">
            <Link href="/courses">Browse courses</Link>
          </Button>
        </div>
      ) : (
        <>
          {finished.length > 0 ? (
            <p className="mt-8 text-foreground/75">
              {finished.length} {finished.length === 1 ? "course" : "courses"} completed,{" "}
              {passedCount} passed.
              {current.length > 0
                ? ` ${current.length} in progress.`
                : ""}
            </p>
          ) : null}

          <Section title="In progress" rows={current} />
          <Section title="Completed" rows={finished} />
          <Section title="Withdrawn" rows={withdrawn} />
        </>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: ReportRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="font-display text-3xl text-primary">{title}</h2>
      <ul className="mt-5 space-y-4">
        {rows.map((row) => (
          <li key={row.enrollmentId}>
            <Link
              href={`/portal/${row.enrollmentId}`}
              className="group flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-lift"
            >
              <div className="min-w-[14rem] flex-1">
                <h3 className="font-display text-2xl text-primary">{row.courseTitle}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {row.courseCode} · {row.term}
                  {row.teacherName ? ` · ${row.teacherName}` : ""}
                </p>

                {row.certificateNumber ? (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-foreground/75">
                    <Award className="h-4 w-4 text-gold" />
                    {row.certificateRevoked
                      ? `Certificate ${row.certificateNumber} — revoked`
                      : `Certificate ${row.certificateNumber}`}
                  </p>
                ) : null}

                {row.outstanding > 0 ? (
                  <p className="mt-2 text-sm text-foreground/75">
                    Outstanding balance: {formatFee(row.outstanding)}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="font-display text-3xl leading-none text-primary lining-nums tabular-nums">
                    {row.grade === null ? "—" : pct(row.grade)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.grade === null
                      ? "not marked yet"
                      : row.isFinal
                        ? "final grade"
                        : "grade so far"}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {/* A verdict only once the class is over — a pass mark applied
                      to a partly marked course would be misleading. */}
                  {row.passed !== null ? (
                    <Badge variant={row.passed ? "default" : "destructive"}>
                      {row.passed ? "Passed" : "Did not pass"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="capitalize">
                      {row.status}
                    </Badge>
                  )}
                  {row.paymentStatus !== "paid" && row.paymentStatus !== "waived" ? (
                    <Badge variant="destructive" className="capitalize">
                      {row.paymentStatus}
                    </Badge>
                  ) : null}
                </div>

                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
