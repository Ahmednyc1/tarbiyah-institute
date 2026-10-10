/**
 * Regenerate the browser-tab icon, the Apple touch icon and favicon.ico from
 * `lib/mark.ts`.
 *
 *     node scripts/build-icons.mjs
 *
 * The three files it writes are COMMITTED, not built on demand — Next.js serves
 * `app/icon.svg`, `app/apple-icon.png` and `app/favicon.ico` as static assets by
 * file-name convention, and a browser asking for a favicon should never wait on
 * a render. Run this again whenever the mark changes, and commit the result.
 *
 * It is a script rather than a one-off because the day the real logo file turns
 * up, swapping the paths in lib/mark.ts and re-running this is the whole job.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { MARK_COLOURS, markSvg } from "../lib/mark.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const app = join(root, "app");

/**
 * Cream mark on a deep green tile, not the other way round.
 *
 * The site itself is green ink on cream paper, so this inverts the brand — but
 * a favicon is a chip a few pixels wide sitting against a tab strip that is
 * light in one theme and dark in another. A saturated ground reads as a
 * deliberate object in both; a cream one dissolves into a light tab.
 */
const TILE = { bg: MARK_COLOURS.green, ink: MARK_COLOURS.cream, accent: MARK_COLOURS.gold };

/** Browser tab. Tight padding, because 16px has none to spare. */
const icon = markSvg({ ...TILE, radius: 12, pad: 5 });

/**
 * iOS. No corner radius — the system applies its own mask and would clip ours —
 * and generous padding so the mark clears that mask comfortably.
 */
const appleSvg = markSvg({ ...TILE, radius: 0, pad: 13 });

/** favicon.ico, for Safari and for Google's search results, which still ask. */
const ICO_SIZES = [16, 32, 48];

/**
 * An .ico is a directory of images rather than a format of its own. Every
 * browser that matters reads PNG payloads inside one, so that is what goes in:
 * a 6-byte header, a 16-byte entry per image, then the PNGs end to end.
 */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(pngs.length, 4);

  let offset = 6 + pngs.length * 16;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 256 is encoded as 0
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); // palette size; 0 for truecolour
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const render = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

mkdirSync(app, { recursive: true });

writeFileSync(join(app, "icon.svg"), icon);

writeFileSync(join(app, "apple-icon.png"), await render(appleSvg, 180));

writeFileSync(
  join(app, "favicon.ico"),
  buildIco(
    await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, data: await render(icon, size) })),
    ),
  ),
);

console.log("wrote app/icon.svg, app/apple-icon.png, app/favicon.ico");
