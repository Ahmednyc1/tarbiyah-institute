import { MARK_COLOURS, markSvg } from "@/lib/mark";

/**
 * The institute's name, set in type rather than shown as a picture.
 *
 * WHY THIS IS NOT AN IMAGE. The only logo artwork anyone has is 64 pixels
 * wide (see lib/mark.ts). Shown at the size a header wants, it is visibly
 * soft, and nothing recovers detail a file never captured — upscalers and
 * auto-tracers invent serif shapes that were never there, which on a wordmark
 * reads worse than blur. So the name is typeset in Cormorant Garamond, the
 * same high-contrast old-style serif the site already uses for every heading,
 * and the seedling is drawn as vector. Both are sharp at any size on any
 * screen, for ever.
 *
 * THE LETTERFORMS ARE CORMORANT'S, NOT THE DESIGNER'S. This is close in
 * spirit and not identical, and it is a stand-in: the moment somebody produces
 * the real logo file, the right move is to go back to an image of it. The
 * original also carries "MAS" above and "INSTITUTE" below in micro-caps, left
 * out here because at header size they are three pixels tall and add noise.
 *
 * Sized entirely by `font-size`, so a caller changes one number and the
 * sprout, the tracking and the spacing all follow.
 */

/**
 * Built once at module load rather than per render. It is a pure string, and
 * an SVG data URI stays crisp at any size — no `dangerouslySetInnerHTML`, and
 * no second network request.
 */
const SPROUT = `data:image/svg+xml;base64,${
  typeof window === "undefined"
    ? Buffer.from(markSvg({ ink: MARK_COLOURS.greenMid, accent: MARK_COLOURS.gold, pad: 0 })).toString("base64")
    : btoa(markSvg({ ink: MARK_COLOURS.greenMid, accent: MARK_COLOURS.gold, pad: 0 }))
}`;

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      aria-label="MAS Tarbiya Institute"
      role="img"
      className={`font-display font-semibold leading-none tracking-[0.02em] text-primary-deep ${className ?? ""}`}
    >
      {/* The sprout grows out of the "I", which is the whole idea of the mark —
          tarbiyah means cultivation, so the word grows a plant out of itself.
          Splitting the string is what lets it sit over that one letter without
          hard-coding a pixel offset: everything below is in `em`, so it tracks
          the font size. */}
      <span aria-hidden>TARB</span>
      <span aria-hidden className="relative inline-block">
        I
        {/* Every number here is measured out of the font file rather than
            nudged by eye, so the sprout stays put at any size and survives a
            change of weight:

              units/em 1000 · ascender 0.924 · descender -0.287 · cap 0.625
              "I" advance 0.339em

            With leading-none the box is exactly 1em tall, which puts the
            baseline 0.8185em below its top and the cap top at 0.1935em. A
            0.58em sprout overlapping the cap by 0.1em therefore starts at
            0.1935 - 0.58 + 0.1 = -0.286em, and centring it on the "I" is
            (0.339 - 0.58) / 2 = -0.12em. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise */}
        <img
          src={SPROUT}
          alt=""
          className="pointer-events-none absolute"
          style={{ width: "0.58em", height: "0.58em", left: "-0.12em", top: "-0.286em" }}
        />
      </span>
      <span aria-hidden>YA</span>
    </span>
  );
}
