import type { MetadataRoute } from "next";

/**
 * Keep the site out of search results until it has its real address.
 *
 * This is staging. It runs on a vercel.app URL that nobody should find, and
 * two things follow from letting a crawler in. A page indexed under
 * tarbiyah-institute.vercel.app can outrank the masjid's own site later, and
 * that is slow and irritating to undo — Google keeps a URL long after it stops
 * being the one you want. And a registration page in search results is an
 * invitation to enrol in a course that is not open yet.
 *
 * DELETE THIS FILE, or flip `disallow` to an empty array, the day the real
 * domain goes live. A site nobody can find is worth nothing to the institute,
 * and this is exactly the sort of guard that gets left on for a year because
 * nobody remembers it is here.
 *
 * It is a request, not a wall. Well-behaved crawlers obey it; nothing stops
 * somebody who has the URL. What actually protects student records is the
 * sign-in on /portal, /admin and /gradebook, and row-level security behind it.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
