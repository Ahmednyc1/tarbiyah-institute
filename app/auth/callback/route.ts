import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth landing point. Google redirects here with a `code`, which is traded for
 * a session. A Route Handler can write cookies, so the session persists.
 *
 * This path must also be registered in Supabase under
 * Authentication -> URL Configuration -> Redirect URLs, or Supabase refuses the
 * redirect before the browser ever reaches us.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Relative paths only — an absolute `next` here would be an open redirect,
  // and this URL is attacker-supplied.
  const requested = searchParams.get("next") ?? "/portal";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/portal";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth?error=oauth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=oauth`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
