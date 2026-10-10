import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { MARK_COLOURS, markSvg } from "@/lib/mark";

/**
 * The picture that appears when somebody pastes a link to the institute into
 * WhatsApp, iMessage, Slack or a group chat — which, for a Brooklyn masjid, is
 * how almost every link will actually travel.
 *
 * IT IS BUILT FROM TYPE, NOT FROM THE LOGO FILE. The only artwork we have is
 * 64x64 (see lib/mark.ts); at the 1200x630 this format demands it would be a
 * smear. So the institute's name is set properly in the site's own display
 * serif, and the only graphic is the redrawn seedling, which is vector and
 * therefore sharp at any size.
 *
 * Next.js renders this once at build time and serves the result as a static
 * PNG, so no visitor and no crawler ever waits for it.
 */

export const alt = "MAS Tarbiya Institute — Islamic studies in Brooklyn, New York";

export const size = { width: 1200, height: 630 };

export const contentType = "image/png";

/**
 * The fonts are read off disk rather than fetched from Google at build time, so
 * a network hiccup can never fail a deploy. They are subsetted to printable
 * ASCII plus an em dash, a curly apostrophe and a middot — generous enough that
 * editing the words below cannot silently blank a glyph, but anything outside
 * that set (Arabic, for one) will not render and needs a fresh subset.
 *
 * `satori`, which does the typesetting here, reads only ttf, otf and woff.
 */
const [displayFont, bodyFont] = await Promise.all([
  readFile(join(process.cwd(), "app/fonts/CormorantGaramond-SemiBold.ttf")),
  readFile(join(process.cwd(), "app/fonts/SourceSans3-Regular.ttf")),
]);

/**
 * The mark, inlined as a data URI.
 *
 * Base64 rather than a raw SVG string: the markup contains characters that have
 * to be percent-encoded inside a URI, and base64 sidesteps the whole question.
 */
const mark = `data:image/svg+xml;base64,${Buffer.from(
  markSvg({ ink: MARK_COLOURS.greenMid, accent: MARK_COLOURS.gold, pad: 0 }),
).toString("base64")}`;

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: MARK_COLOURS.cream,
          fontFamily: "Source Sans 3",
        }}
      >
        {/* A gold hairline across the top, the way a printed programme is ruled. */}
        <div style={{ display: "flex", height: 10, background: MARK_COLOURS.gold }} />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 86px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain img only */}
          <img src={mark} alt="" width={96} height={96} />

          <div
            style={{
              display: "flex",
              marginTop: 34,
              fontSize: 24,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: MARK_COLOURS.greenMid,
              opacity: 0.72,
            }}
          >
            Brooklyn, New York
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 16,
              fontFamily: "Cormorant Garamond",
              fontSize: 112,
              lineHeight: 1,
              color: MARK_COLOURS.greenMid,
            }}
          >
            MAS Tarbiya Institute
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 26,
              fontSize: 36,
              lineHeight: 1.4,
              color: "#1a2820",
              opacity: 0.78,
            }}
          >
            Seeking transformation, not just information
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: 96,
            padding: "0 86px",
            background: MARK_COLOURS.green,
            color: MARK_COLOURS.cream,
            fontSize: 28,
            letterSpacing: 3,
          }}
        >
          mastarbiyainstitute.org
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cormorant Garamond", data: displayFont, style: "normal", weight: 600 },
        { name: "Source Sans 3", data: bodyFont, style: "normal", weight: 400 },
      ],
    },
  );
}
