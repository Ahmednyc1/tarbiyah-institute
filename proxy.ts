import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request.
 *
 * NOTE: this file is `proxy.ts`, not `middleware.ts` — Next.js 16 renamed
 * Middleware to Proxy. Every Supabase SSR guide still says `middleware.ts`;
 * that filename does nothing here, and sessions would silently expire.
 *
 * Server Components cannot write cookies, so this is the only place a rotated
 * refresh token can be persisted. Without it a user is logged out whenever
 * their access token expires.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Do not remove: this call is what performs the refresh. It must also stay
  // directly after the client is created — inserting logic between the two
  // makes sessions hard to debug.
  await supabase.auth.getUser();

  // Must be returned unmodified. Building a different response here drops the
  // refreshed cookies and logs the user out at random.
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets, images, and the Stripe webhook.
     *
     * Static files never need a session and refreshing on them wastes a round
     * trip per file. The webhook carries no cookies at all — it is
     * authenticated by Stripe's signature — so the getUser() call below would
     * be a guaranteed-useless network hop on the critical path of recording
     * somebody's payment, inside a request Stripe gives up on after 20s.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
