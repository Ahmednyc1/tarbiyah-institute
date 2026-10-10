"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogOut, Menu, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/auth/actions";
import { cn } from "@/lib/utils";

const baseLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/courses", label: "Courses" },
];

export function SiteHeader({
  signedIn,
  isAdmin = false,
  isTeacher = false,
}: {
  signedIn: boolean;
  isAdmin?: boolean;
  isTeacher?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Admin and Gradebook are separate on purpose — Sh Badawy is both, and they
  // are different jobs.
  const links = [
    ...baseLinks,
    ...(signedIn ? [{ href: "/portal", label: "Portal" }] : []),
    // Admins can grade any class, so this must match the /gradebook guard —
    // teacher OR admin, not teacher alone.
    ...(isTeacher || isAdmin ? [{ href: "/gradebook", label: "Gradebook" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  // Exact match for the home link, prefix match for everything else, so
  // /courses/sciences-of-the-quran still highlights "Courses".
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-24">
        <Link href="/" className="flex items-center gap-3" onClick={() => setOpen(false)}>
          {/* `logo-wordmark.png` is Mas_tarbiyah_logo.png trimmed of its
              transparent padding and resampled up to 288x99, by
              scripts/build-icons.mjs. The original is a 64x64 square holding a
              mark that fills about a third of it, so rendering it as a square
              spent most of the header on nothing.

              288 IS DELIBERATE: twice the 144px this renders at on a wide
              screen, so a retina display gets one device pixel per image
              pixel. Shipping the 64px original instead means Next serves 64px
              — its optimizer will not enlarge past a file's natural size — and
              the browser stretches it 4.5x at draw time, which looks worse
              than the same enlargement done once with a proper filter.

              Sized by WIDTH with height auto: the aspect ratio now comes from
              the artwork rather than from a box somebody chose. width/height
              must stay equal to the file's real dimensions, since the browser
              derives the rendered height from them.

              w-36 is about as far as a 64px-wide source stretches. Past there
              the serifs visibly soften, and that is the ceiling until somebody
              produces the real logo file. */}
          <Image
            src="/logo-wordmark.png"
            alt="MAS Tarbiya Institute"
            width={288}
            height={99}
            priority
            className="h-auto w-24 sm:w-36"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-primary",
                isActive(link.href)
                  ? "border-b-2 border-gold pb-1 text-primary"
                  : "text-foreground/75",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {signedIn ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href="/portal">
                  <UserRound className="mr-1.5 h-4 w-4" />
                  Account
                </Link>
              </Button>
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </form>
            </>
          ) : (
            <Button asChild size="sm" className="bg-primary hover:bg-primary-deep">
              <Link href="/auth">Login</Link>
            </Button>
          )}
        </div>

        <button
          className="md:hidden"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border bg-background px-5 pb-5 pt-3 md:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-1 text-base font-medium text-foreground/80"
              >
                {link.label}
              </Link>
            ))}
            {signedIn ? (
              <form action={signOut}>
                <Button type="submit" variant="outline" className="w-full">
                  Sign out
                </Button>
              </form>
            ) : (
              <Button asChild className="bg-primary hover:bg-primary-deep">
                <Link href="/auth" onClick={() => setOpen(false)}>
                  Login
                </Link>
              </Button>
            )}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
