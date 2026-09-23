import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ClipboardCheck, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";

const benefits = [
  { icon: BookOpen, label: "Register for classes online" },
  { icon: ClipboardCheck, label: "Follow your attendance and grades" },
  { icon: ScrollText, label: "Collect your certificates" },
];

export const metadata: Metadata = {
  title: "Sign in",
  description:
    "Sign in to the MAS Tarbiya Institute student portal to register for courses and follow your studies.",
};

export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { next, error } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") ? next : "/portal";

  if (user) redirect(target);

  return (
    <div className="mx-auto flex max-w-md flex-col px-5 py-24">
      <p className="eyebrow text-center">Student access</p>
      <div className="gold-rule mx-auto mt-3" />
      <h1 className="mt-6 text-center font-display text-4xl text-primary">
        Welcome to the institute
      </h1>
      <p className="mt-3 text-center leading-relaxed text-foreground/75">
        One account for everything you study here.
      </p>

      {/* bg-secondary, a shade warmer than the page, so the white Google button
          below reads as the foreground action rather than blending into it. */}
      <div className="mt-9 rounded-lg border border-border bg-secondary p-8 shadow-card">
        {error ? (
          <p role="alert" className="mb-5 text-center text-sm text-destructive">
            That didn&apos;t complete. Please try again.
          </p>
        ) : null}

        <ul className="space-y-3">
          {benefits.map((benefit) => (
            <li key={benefit.label} className="flex items-center gap-3 text-sm text-foreground/80">
              <benefit.icon className="h-4 w-4 shrink-0 text-gold" />
              {benefit.label}
            </li>
          ))}
        </ul>

        <div className="my-6 h-px bg-border" />

        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={target} />
          <Button
            type="submit"
            className="h-11 w-full border border-border bg-card text-foreground shadow-sm hover:bg-card/80"
          >
            <GoogleMark />
            Continue with Google
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          New here? Signing in creates your account.
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        We receive only your name and email address from Google.
      </p>
      <p className="mt-2 text-center text-xs">
        <Link href="/courses" className="text-primary underline-offset-4 hover:underline">
          Just browsing? See the courses first
        </Link>
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.63h6.2a5.3 5.3 0 0 1-2.3 3.48v2.89h3.72c2.18-2 3.44-4.96 3.44-8.55Z"
      />
      <path
        fill="#34A853"
        d="M12 23.5c3.11 0 5.72-1.03 7.62-2.8l-3.72-2.89c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5Z"
      />
      <path
        fill="#FBBC05"
        d="M5.55 14.16a6.9 6.9 0 0 1 0-4.32V6.86H1.7a11.5 11.5 0 0 0 0 10.28l3.85-2.98Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.32 15.1.5 12 .5 7.5.5 3.62 3.08 1.7 6.86l3.85 2.98C6.46 7.12 9 4.77 12 4.77Z"
      />
    </svg>
  );
}
