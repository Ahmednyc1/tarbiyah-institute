import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * A Supabase client holding the service role key. It bypasses RLS entirely.
 *
 * `server-only` at the top is the guard that matters: importing this file from
 * a Client Component is a build error rather than a key in a browser bundle.
 * Nothing here is ever reachable from the client.
 *
 * It exists for exactly one caller — the Stripe webhook. `redeem_hold` is
 * deliberately revoked from `anon` and `authenticated` (see
 * 20260924120100_seat_hold_rpcs.sql), because a signed-in user who could call
 * it would enrol themselves without paying. The webhook has no session and no
 * person behind it; Stripe's signature is what authorises it.
 *
 * Do not reach for this anywhere else. Every other write in this app goes
 * through the caller's own client so that RLS re-checks it.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error("SUPABASE_SECRET_KEY is not set — the payment webhook cannot record anything.");
  }

  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: {
      // No cookies, no refresh, no storage. This client must never pick up a
      // session from anywhere — it is the session.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
