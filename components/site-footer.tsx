import Link from "next/link";

const CONTACT_EMAIL = "admissions@mastarbiya.org";

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <h3 className="font-display text-2xl">MAS Tarbiya Institute</h3>
          <p className="mt-3 max-w-sm text-sm text-primary-foreground/75">
            Classical Islamic learning delivered with modern clarity — Qur&apos;anic sciences, fiqh
            and character formation for every generation.
          </p>
        </div>
        <div>
          <h4 className="text-sm uppercase tracking-[0.2em] text-gold">Explore</h4>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/80">
            <li>
              <Link href="/courses" className="hover:text-primary-foreground">
                Courses offered
              </Link>
            </li>
            <li>
              <Link href="/about" className="hover:text-primary-foreground">
                About the institute
              </Link>
            </li>
            <li>
              <Link href="/portal" className="hover:text-primary-foreground">
                Student portal
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm uppercase tracking-[0.2em] text-gold">Contact</h4>
          <ul className="mt-4 space-y-2 text-sm text-primary-foreground/80">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-primary-foreground">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>Registration open year-round</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15 py-5 text-center text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} MAS Tarbiya Institute. All rights reserved.
      </div>
    </footer>
  );
}
