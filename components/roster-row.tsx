"use client";

import { useActionState, useState } from "react";
import { MailWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  recordPayment,
  resendConfirmation,
  setEnrollmentStatus,
  waiveFee,
  type ResendState,
} from "@/app/admin/classes/[classId]/actions";
import { formatFee } from "@/lib/format";

export function RosterRow({
  classId,
  enrollmentId,
  name,
  studentNumber,
  contact,
  personId,
  emailUnconfirmed,
  status,
  amountDue,
  amountPaid,
  paymentStatus,
  waiverNote,
}: {
  classId: string;
  enrollmentId: string;
  name: string;
  studentNumber: string;
  contact: string | null;
  personId: string | null;
  /** Has an address on file that nobody has proved reaches them. */
  emailUnconfirmed: boolean;
  status: string;
  amountDue: number;
  amountPaid: number;
  paymentStatus: string;
  waiverNote: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [resend, resendAction, resending] = useActionState<ResendState, FormData>(
    resendConfirmation,
    null,
  );
  const outstanding = Math.max(0, amountDue - amountPaid);
  const dropped = status === "dropped";

  return (
    <li
      className={`rounded-lg border border-border bg-card p-4 shadow-card ${dropped ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-[12rem]">
          <span className="font-medium text-foreground">{name}</span>
          <span className="block text-xs text-muted-foreground">
            {studentNumber}
            {contact ? ` · ${contact}` : ""}
          </span>

          {/* An address nobody has proved. The student keeps their seat either
              way — this is about whether we can reach them, not whether they
              are registered. Shown so that silence becomes visible. */}
          {emailUnconfirmed && !dropped ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <MailWarning className="h-3 w-3" />
                Address unconfirmed
              </span>
              <form action={resendAction}>
                <input type="hidden" name="classId" value={classId} />
                <input type="hidden" name="personId" value={personId ?? ""} />
                <input type="hidden" name="enrollmentId" value={enrollmentId} />
                <button
                  type="submit"
                  disabled={resending || !personId}
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
                >
                  {resending ? "Sending…" : "Send another link"}
                </button>
              </form>
              {resend?.ok ? <span className="text-xs text-primary">{resend.ok}</span> : null}
              {resend?.error ? (
                <span className="text-xs text-destructive">{resend.error}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm lining-nums tabular-nums text-foreground/80">
            {formatFee(amountPaid)} of {formatFee(amountDue)}
          </span>
          <Badge
            variant={
              paymentStatus === "paid" || paymentStatus === "waived" ? "default" : "destructive"
            }
            className="capitalize"
          >
            {paymentStatus}
          </Badge>
          {dropped ? <Badge variant="secondary">Dropped</Badge> : null}

          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Manage"}
          </Button>

          {/* Dropping is the common roster action, so it gets its own button
              rather than living three clicks deep in the status dropdown. */}
          {!dropped ? (
            <form action={setEnrollmentStatus}>
              <input type="hidden" name="classId" value={classId} />
              <input type="hidden" name="enrollmentId" value={enrollmentId} />
              <input type="hidden" name="status" value="dropped" />
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
              >
                Drop
              </Button>
            </form>
          ) : (
            <form action={setEnrollmentStatus}>
              <input type="hidden" name="classId" value={classId} />
              <input type="hidden" name="enrollmentId" value={enrollmentId} />
              <input type="hidden" name="status" value="enrolled" />
              <Button type="submit" variant="ghost" size="sm">
                Re-enrol
              </Button>
            </form>
          )}
        </div>
      </div>

      {waiverNote ? (
        <p className="mt-2 text-xs text-muted-foreground">Waiver: {waiverNote}</p>
      ) : null}

      {open ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {/* Each payment is its own record, so a balance settled in two goes
              shows as two. Finance reconciles each deposit separately. */}
          <form action={recordPayment} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <div className="w-36 space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Payment received
              </label>
              <Input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                // Pre-filled with what is still owed: the common case at the
                // desk is somebody settling the balance in full.
                defaultValue={outstanding > 0 ? outstanding : ""}
                className="lining-nums tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                How
              </label>
              {/* Cash and transfers never reach Stripe, so finance has no other
                  way to tell them apart when reconciling the month. */}
              <select
                name="method"
                defaultValue="cash"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="cash">Cash</option>
                <option value="transfer">Bank transfer</option>
                <option value="card">Card</option>
                <option value="other">Other</option>
              </select>
            </div>
            <Button type="submit" size="sm" className="bg-primary hover:bg-primary-deep">
              Record payment
            </Button>
          </form>

          {/* Waive — zakat or sadaqah. */}
          <form action={waiveFee} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <div className="min-w-[14rem] flex-1 space-y-1.5">
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                Waive the fee — reason
              </label>
              <Input name="waiverNote" defaultValue={waiverNote ?? ""} placeholder="Zakat" />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Waive
            </Button>
          </form>

          {/* Roll status. Dropping keeps the record and every mark. */}
          <form action={setEnrollmentStatus} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="classId" value={classId} />
            <input type="hidden" name="enrollmentId" value={enrollmentId} />
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="enrolled">Enrolled</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>
            <Button type="submit" size="sm" variant="outline">
              Update status
            </Button>
            <span className="text-xs text-muted-foreground">
              Set at the end of term. Use Drop to remove someone from the roll.
            </span>
          </form>
        </div>
      ) : null}
    </li>
  );
}
