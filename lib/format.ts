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

/**
 * Money to the cent.
 *
 * formatFee rounds to whole dollars, which reads well on a course card and is
 * wrong anywhere the figure has to agree with a bank statement — $12.50 must
 * not print as $13 on something being reconciled.
 */
export const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
