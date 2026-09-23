/**
 * Pure formatting helpers.
 *
 * Deliberately free of imports: these are used by client components, and
 * anything that reaches into `next/headers` or the server Supabase client
 * cannot be pulled into a browser bundle.
 */
export const formatFee = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
