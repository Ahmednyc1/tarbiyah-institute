import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { adminViewer } from "@/lib/guard";
import { formatMoney } from "@/lib/format";
import { reconcilePayments } from "@/lib/reconcile";

export const metadata: Metadata = { title: "Reconcile payments" };

/**
 * What Stripe took, against what this database recorded.
 *
 * The /admin layout guards the route, but this page reaches Stripe and reads
 * every student's name, so it checks for itself rather than trusting the
 * layout — the same reason the CSV export does.
 *
 * Always slow-ish: it walks Stripe's sessions on every load. That is the
 * point. A cached answer to "has any money gone missing" is worse than no
 * answer, because it is believed.
 */
export default async function ReconcilePage({
  searchParams,
}: PageProps<"/admin/payments/reconcile">) {
  if (!(await adminViewer())) notFound();

  const query = await searchParams;
  const requested = Number(Array.isArray(query.days) ? query.days[0] : query.days);
  const days = Number.isFinite(requested) && requested > 0 && requested <= 365 ? requested : 90;

  const { orphans, unpaid, sessionsChecked, refundsIgnored, truncated, stripeError } =
    await reconcilePayments(days);

  /**
   * "Nothing is missing" and "nothing is missing, and I set two refunds aside"
   * are different claims, and the gap between them is exactly where a mistake
   * would hide. So the page says which one it is making.
   */
  const refundNote =
    refundsIgnored > 0
      ? ` ${refundsIgnored} refunded ${refundsIgnored === 1 ? "payment was" : "payments were"} ` +
        `set aside — that money went back to the payer, so there is nothing to record.`
      : "";

  return (
    <div className="mx-auto max-w-5xl px-5 py-16">
      <Link
        href="/admin/payments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Payments
      </Link>

      <p className="eyebrow mt-6">Reconciliation</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-4xl text-primary">Did anything go missing?</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-foreground/80">
        Every payment Stripe says it took in the last {days} days, checked against what this
        system recorded. A payment with no enrollment behind it is somebody who paid and did not
        get their place — and nothing else in the system would ever mention it.
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {[30, 90, 365].map((n) => (
          <Link
            key={n}
            href={`/admin/payments/reconcile?days=${n}`}
            className={
              n === days
                ? "rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
                : "rounded-md border border-border px-3 py-1.5 text-foreground/75 hover:border-primary hover:text-primary"
            }
          >
            Last {n === 365 ? "year" : `${n} days`}
          </Link>
        ))}
      </div>

      {/* ---- the alarm ---- */}
      <section className="mt-10">
        {stripeError ? (
          <Panel tone="warn" icon={AlertTriangle} title="Could not reach Stripe">
            <p>{stripeError}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Nothing below should be read as an all-clear — this check did not run.
            </p>
          </Panel>
        ) : orphans && orphans.length === 0 ? (
          <Panel tone="good" icon={CheckCircle2} title="Nothing is missing">
            <p>
              {sessionsChecked === 0
                ? "Stripe took no payments at all in this period, so there is nothing to account for."
                : sessionsChecked === 1
                  ? "The single Stripe session in this period is accounted for."
                  : `All ${sessionsChecked} Stripe sessions in this period are accounted for.`}
              {/*
                "kept" rather than "took" once a refund has been set aside,
                because a refunded payment was taken and does not have a record
                here — and saying "every payment Stripe took" would contradict
                the sentence immediately after it.
              */}
              {sessionsChecked > 0
                ? ` Every payment Stripe ${refundsIgnored > 0 ? "kept" : "took"} has a record against an enrollment here.`
                : ""}
              {refundNote}
            </p>
          </Panel>
        ) : orphans ? (
          <>
            <Panel tone="warn" icon={AlertTriangle} title={`${orphans.length} paid, not recorded`}>
              <p>
                Stripe took this money and nothing in the system recorded it. Each of these is
                somebody who paid for a seat.
                {refundNote}
              </p>
            </Panel>

            <ul className="mt-4 space-y-3">
              {orphans.map((o) => (
                <li
                  key={o.sessionId}
                  className="rounded-lg border border-destructive/40 bg-card p-4 shadow-card"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {o.personName ?? o.email ?? "Unknown person"}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {o.className ?? "Unknown course"} ·{" "}
                        {new Date(o.paidAt).toLocaleString("en-US", {
                          timeZone: "America/New_York",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {o.sessionId}
                      </p>
                    </div>
                    <span className="shrink-0 font-display text-xl text-primary lining-nums tabular-nums">
                      {formatMoney(o.amount)}
                    </span>
                  </div>

                  <p className="mt-3 border-t border-border/60 pt-3 text-sm text-foreground/75">
                    {o.holdMissing
                      ? "No seat reservation exists for this payment — it was not started from this site. Check it in the Stripe dashboard before acting."
                      : o.holdRedeemed
                        ? "The seat was given out, so the student is enrolled — only the payment record is missing. Record it by hand on the class roster."
                        : "The seat was never given out. Enrol them on the class roster; if the class is now full, raise its capacity by one in Courses first."}
                  </p>

                  {o.refunded > 0 ? (
                    <p className="mt-2 text-sm text-foreground/75">
                      {formatMoney(o.refunded)} of this has already been refunded. The rest was
                      kept, so there is still something to account for.
                    </p>
                  ) : null}

                  {o.refundUnknown ? (
                    <p className="mt-2 text-sm text-foreground/75">
                      Stripe could not be asked whether this one was refunded, so it is listed
                      anyway — check the dashboard before acting on it.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      {truncated ? (
        <p className="mt-4 text-sm text-destructive">
          Stopped after checking {sessionsChecked} sessions, so this is a partial answer. Narrow
          the period.
        </p>
      ) : null}

      {/* ---- the quieter list ---- */}
      <section className="mt-14">
        <h2 className="font-display text-2xl text-primary">Enrolled, still owing</h2>
        <p className="mt-2 max-w-prose text-sm text-muted-foreground">
          Not a problem to fix today — usually somebody enrolled at the desk who has not paid yet.
          Waived fees are left out entirely, since that was a decision somebody already made.
        </p>

        {unpaid.length === 0 ? (
          <p className="mt-4 rounded-lg border border-border bg-card p-4 text-sm text-foreground/75 shadow-card">
            Everybody enrolled has paid in full.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/60 rounded-lg border border-border bg-card shadow-card">
            {unpaid.map((u) => (
              <li
                key={u.enrollmentId}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <span className="text-foreground/90">{u.studentName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {u.studentNumber} · {u.className}
                  </span>
                </div>
                <span className="text-sm lining-nums tabular-nums text-destructive">
                  {formatMoney(u.owed)} owing
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-12 flex items-start gap-2 text-sm text-muted-foreground">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          This runs fresh every time the page loads — nothing is cached. A stale answer to
          &ldquo;has any money gone missing&rdquo; would be worse than none, because it would be
          believed.
        </span>
      </p>
    </div>
  );
}

function Panel({
  tone,
  title,
  icon: Icon,
  children,
}: {
  tone: "good" | "warn";
  title: string;
  icon: typeof CheckCircle2;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "good"
          ? "rounded-lg border border-border bg-card p-5 shadow-card"
          : "rounded-lg border border-destructive/40 bg-destructive/5 p-5"
      }
    >
      <div className="flex items-center gap-3">
        <Icon className={tone === "good" ? "h-6 w-6 text-primary" : "h-6 w-6 text-destructive"} />
        <h2 className="font-display text-2xl text-primary">{title}</h2>
      </div>
      <div className="mt-3 leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}
