import { createClient } from "@/lib/supabase/server";

/** The masjid is in Brooklyn; a payment's day is the day it was taken there. */
export const INSTITUTE_TZ = "America/New_York";

export type PaymentRow = {
  payment_id: string;
  paid_at: string;
  local_date: string;
  student_name: string;
  student_number: string | null;
  course_code: string;
  course_title: string;
  term: string;
  amount: number;
  method: "cash" | "transfer" | "card" | "other";
  reference: string | null;
  note: string | null;
  recorded_by: string | null;
};

export type WaivedRow = {
  enrollment_id: string;
  student_name: string;
  student_number: string | null;
  course_code: string;
  course_title: string;
  term: string;
  amount_due: number;
  amount_paid: number;
  waiver_note: string | null;
};

/** Today where the money is, which is not necessarily today where the server is. */
export function instituteToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: INSTITUTE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * The range to show when none was asked for: this month so far, which is what
 * somebody reconciling almost always wants.
 */
export function defaultRange(): { from: string; to: string } {
  const today = instituteToday();
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Falls back rather than throwing — a mistyped URL should not be a crash. */
export function readRange(params: {
  from?: string | string[];
  to?: string | string[];
}): { from: string; to: string } {
  const fallback = defaultRange();
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const from = one(params.from);
  const to = one(params.to);

  const range = {
    from: from && ISO_DATE.test(from) ? from : fallback.from,
    to: to && ISO_DATE.test(to) ? to : fallback.to,
  };

  // Backwards is a typo, not a request for nothing.
  return range.from > range.to ? { from: range.to, to: range.from } : range;
}

export async function getPayments(from: string, to: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("payments_report", {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PaymentRow[];
}

export async function getWaived() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("waived_fees");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WaivedRow[];
}

export const METHOD_LABEL: Record<PaymentRow["method"], string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  card: "Card",
  other: "Other",
};

/**
 * Totals per method, plus the split finance actually cares about: what Stripe
 * will show on its payout, and what arrived some other way and will not.
 */
export function summarise(rows: PaymentRow[]) {
  const byMethod = new Map<PaymentRow["method"], { total: number; count: number }>();

  for (const row of rows) {
    const current = byMethod.get(row.method) ?? { total: 0, count: 0 };
    byMethod.set(row.method, {
      total: current.total + Number(row.amount),
      count: current.count + 1,
    });
  }

  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  const card = byMethod.get("card")?.total ?? 0;
  const refunds = rows
    .filter((r) => Number(r.amount) < 0)
    .reduce((sum, r) => sum + Number(r.amount), 0);

  return { byMethod, total, card, offline: total - card, refunds };
}
