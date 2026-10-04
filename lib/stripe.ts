import "server-only";
import Stripe from "stripe";

/**
 * The Stripe client, for server code only.
 *
 * Built on demand rather than at module load. The constructor throws when the
 * key is absent, and a module-level instance would take the whole route down
 * with it — including `/register/[classId]`, which must still render its
 * course details and its "pay at the desk" instructions on a machine with no
 * Stripe configuration at all.
 *
 * No `apiVersion` is passed. stripe-node 23 pins `2026-09-30.endive`, and its
 * types describe only that version; naming a different one makes every call
 * typecheck against a shape the library is not sending.
 */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set — online payment is not configured.");
  }
  return new Stripe(key, { typescript: true });
}

/** Whether online payment is configured at all. Cheap, and safe to call anywhere. */
export function stripeIsConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Stripe's floor for a USD charge. Below this the API refuses the session
 * outright, so a cheaper class cannot be paid for online at all — the
 * registration page must not offer a button that is certain to fail, and the
 * action must refuse it if one is somehow pressed. Both read this.
 */
export const MIN_CHARGE_DOLLARS = 0.5;

/** Whether a fee can actually be taken online. */
export function isChargeable(fee: number): boolean {
  return Number.isFinite(fee) && fee >= MIN_CHARGE_DOLLARS;
}

/**
 * Dollars to the integer cents Stripe deals in.
 *
 * `Math.round` is not decoration. 150.1 * 100 is 15010.000000000002 in binary
 * floating point, and Stripe rejects a non-integer amount outright — so a fee
 * ending in .10 or .20 would fail at checkout and nowhere else.
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Cents back to dollars, for the numeric columns the database stores. */
export function toDollars(cents: number): number {
  return Math.round(cents) / 100;
}
