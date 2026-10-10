import type { MetadataRoute } from "next";

/**
 * Let the institute be found — but only the parts meant for strangers.
 *
 * This file used to disallow everything, because the site was staging on a
 * vercel.app URL and a page indexed there could have outranked the masjid's own
 * address for years afterwards. That is over: it now runs on
 * mastarbiyainstitute.org, and a site nobody can find is worth nothing.
 *
 * What stays shut is everything that is either private or single-use. The
 * private pages are already behind sign-in and row-level security, so this
 * changes nothing about who can read them — what it prevents is a course
 * roster, or a student's marks, surfacing in a search result through some
 * mistake we have not thought of yet. Defence in depth, cheaply.
 *
 * The single-use URLs matter for a different reason. /confirm/<token> and
 * /register/<id>/thanks?session_id=... carry a secret in the path or query.
 * A crawler has no way to discover them, but they end up in browser history,
 * in shared screenshots and in the referrer header, and an indexed one is
 * permanent in a way the token is not meant to be.
 *
 * REMEMBER THIS IS A REQUEST, NOT A WALL. Well-behaved crawlers obey it and
 * nothing stops anybody who has the URL. What actually protects student
 * records is the sign-in on /portal, /admin and /gradebook, the guards in
 * lib/guard.ts, and RLS underneath both.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Signed-in areas. Already protected; kept out of the index anyway.
          "/portal",
          "/admin",
          "/gradebook",
          // Machinery, with nothing to read.
          "/api/",
          "/auth",
          // One-time links that carry a secret in the URL.
          "/confirm/",
          "/register/*/thanks",
        ],
      },
    ],
  };
}
