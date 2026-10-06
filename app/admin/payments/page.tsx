import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  METHOD_LABEL,
  getPayments,
  getWaived,
  readRange,
  summarise,
} from "@/lib/finance";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Payments",
  description: "Money received, itemised.",
};

export default async function PaymentsPage({
  searchParams,
}: PageProps<"/admin/payments">) {
  const { from, to } = readRange(await searchParams);

  const [payments, waived] = await Promise.all([getPayments(from, to), getWaived()]);
  const { byMethod, total, card, offline, refunds } = summarise(payments);

  const query = new URLSearchParams({ from, to }).toString();

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Administration
      </Link>

      <p className="eyebrow mt-6">Finance</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">Payments received</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Every payment in the period, itemised. Card payments appear on the Stripe payout;
        cash and transfers do not, so they are totalled separately.
      </p>

      {/* A plain GET form: the range lives in the URL, so a report can be
          bookmarked, shared, or sent to the treasurer as a link. */}
      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label htmlFor="from" className="text-xs uppercase tracking-wider text-muted-foreground">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={from} className="w-44" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="to" className="text-xs uppercase tracking-wider text-muted-foreground">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={to} className="w-44" />
        </div>
        <Button type="submit" size="sm" className="bg-primary hover:bg-primary-deep">
          Show
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`/admin/payments/export?${query}`}>
            <Download className="mr-1.5 h-4 w-4" />
            Download CSV
          </a>
        </Button>
        {/* Deliberately not inside the date form: reconciliation asks Stripe a
            question of its own and carries its own period. */}
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/payments/reconcile">
            <ShieldCheck className="mr-1.5 h-4 w-4" />
            Reconcile
          </Link>
        </Button>
      </form>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Total received" value={formatMoney(total)} emphasis />
        <Figure label="Card — on Stripe" value={formatMoney(card)} />
        <Figure label="Cash and transfers" value={formatMoney(offline)} />
        <Figure
          label="Refunds included"
          value={refunds === 0 ? "—" : formatMoney(refunds)}
        />
      </div>

      {byMethod.size > 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {[...byMethod.entries()]
            .map(
              ([method, v]) =>
                `${METHOD_LABEL[method]}: ${formatMoney(v.total)} over ${v.count} ${
                  v.count === 1 ? "payment" : "payments"
                }`,
            )
            .join(" · ")}
        </p>
      ) : null}

      <h2 className="mt-14 font-display text-3xl text-primary">
        {payments.length} {payments.length === 1 ? "payment" : "payments"}
      </h2>

      {payments.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          Nothing was received between {from} and {to}.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="bg-secondary/50">
              <tr className="border-b border-border">
                <Th>Date</Th>
                <Th>Student</Th>
                {/* Course absorbs the slack. The reference column would be the
                    other candidate, but it is empty until Stripe is live, and
                    a title is worth more to whoever reads this than a code. */}
                <Th className="w-full">Course</Th>
                <Th>How</Th>
                <Th>Reference</Th>
                <Th>Taken by</Th>
                <Th>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((row) => (
                <tr
                  key={row.payment_id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30"
                >
                  <Td numeric>{row.local_date}</Td>
                  <Td>
                    <span className="font-medium text-foreground">{row.student_name}</span>
                    {row.student_number ? (
                      <span className="block text-xs text-muted-foreground lining-nums">
                        {row.student_number}
                      </span>
                    ) : null}
                  </Td>
                  <Td>
                    {/* Whoever reconciles this does not know the codes. */}
                    <span className="text-foreground">{row.course_title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.course_code} · {row.term}
                    </span>
                  </Td>
                  <Td>{METHOD_LABEL[row.method]}</Td>
                  <Td>
                    {row.reference ? (
                      // Monospace so a Stripe id can be compared character by
                      // character against the dashboard without misreading.
                      <span className="font-mono text-xs">{row.reference}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                  <Td>{row.recorded_by ?? <span className="text-muted-foreground">—</span>}</Td>
                  <Td numeric>
                    <span
                      className={cn(
                        Number(row.amount) < 0 && "font-medium text-destructive",
                      )}
                    >
                      {formatMoney(Number(row.amount))}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-secondary/30">
                <Td />
                <Td />
                <Td />
                <Td />
                <Td />
                <Td>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Total
                  </span>
                </Td>
                <Td numeric>
                  <span className="font-medium text-foreground">{formatMoney(total)}</span>
                </Td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <h2 className="mt-14 font-display text-3xl text-primary">Fees waived</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Places given without charge. Listed so a waived seat is not mistaken for a debt
        still to be collected. Not limited to the period above — a waiver is a standing
        decision, not an event on a date.
      </p>

      {waived.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No fees have been waived.</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="bg-secondary/50">
              <tr className="border-b border-border">
                <Th className="w-full">Student</Th>
                <Th>Course</Th>
                <Th>Reason</Th>
                <Th>Fee waived</Th>
              </tr>
            </thead>
            <tbody>
              {waived.map((row) => (
                <tr
                  key={row.enrollment_id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-secondary/30"
                >
                  <Td>
                    <span className="font-medium text-foreground">{row.student_name}</span>
                  </Td>
                  <Td>
                    {row.course_code}
                    <span className="block text-xs text-muted-foreground">{row.term}</span>
                  </Td>
                  <Td>
                    {row.waiver_note ?? (
                      <span className="text-muted-foreground">No reason recorded</span>
                    )}
                  </Td>
                  <Td numeric>
                    {formatMoney(
                      Math.max(0, Number(row.amount_due) - Number(row.amount_paid)),
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-5 shadow-card",
        emphasis && "border-gold/50",
      )}
    >
      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-4xl leading-none text-primary lining-nums tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, numeric = false }: { children?: React.ReactNode; numeric?: boolean }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-3 align-top text-foreground/80",
        numeric && "lining-nums tabular-nums",
      )}
    >
      {children}
    </td>
  );
}
