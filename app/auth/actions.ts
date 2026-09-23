"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Google is the only sign-in method.
 *
 * Password auth was removed deliberately: with no SMTP configured there was no
 * working password-reset path, so a forgotten password meant a permanently
 * locked account. If a second method is ever added, email OTP is the candidate
 * — and it needs SMTP first.
 */

/** Where to land afterwards. Relative paths only — never an open redirect. */
function safeNext(value: FormDataEntryValue | null) {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/portal";
}

/**
 * Starts the Google OAuth handshake.
 *
 * Runs on the server so the PKCE code verifier is written to an httpOnly
 * cookie — a Server Action can set cookies, a Server Component cannot. The
 * other half of the exchange happens in app/auth/callback/route.ts.
 */
export async function signInWithGoogle(formData: FormData) {
  const supabase = await createClient();
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const next = safeNext(formData.get("next"));

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) redirect("/auth?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
