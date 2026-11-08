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

/**
 * The header logo: the real artwork, recomposited onto the site cream.
 *
 * `new_updated_logo.jpg` arrived on 2026-11-08 and finally replaced the 64px
 * thumbnail this project limped along on for two months. It is 1774x887, which
 * is plenty — but it is a JPEG on a WHITE ground, and this site is cream
 * (#f5f3ec). Dropped in untouched it is a white rectangle floating on a cream
 * header.
 *
 * TRUE TRANSPARENCY CANNOT BE RECOVERED FROM IT, and that is not a limitation
 * of the code. A two-tone logo on white is mathematically ambiguous: the gold
 * at full opacity and a dark ink at 60% opacity produce the identical pixel,
 * and nothing in the file distinguishes them. Any "remove background" pass has
 * to guess, and guesses show up as a halo round the gold.
 *
 * So instead of inventing an alpha channel, the ground is recoloured straight
 * from white to cream, weighted by how light each pixel is: background goes all
 * the way, ink is left alone, and edges blend continuously so there is no
 * key-line. This is exact wherever the logo sits on cream, which is everywhere
 * it is used. IF IT EVER NEEDS TO SIT ON ANOTHER COLOUR, ask the designer for a
 * transparent PNG or an SVG rather than reaching for a background remover.
 */
async function buildHeaderLogo() {
  const src = join(root, "public", "new_updated_logo.jpg");
  const out = join(root, "public", "logo-wordmark.png");
  const CREAM = [0xf5, 0xf3, 0xec];
  const PAD = 14;

  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const ground = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const r = data[i*C], g = data[i*C+1], b = data[i*C+2];
    // 1 = pure background, 0 = solid ink.
    const w = (0.299*r + 0.587*g + 0.114*b) / 255;
    const out = [
      Math.round(r + (CREAM[0] - 255) * w),
      Math.round(g + (CREAM[1] - 255) * w),
      Math.round(b + (CREAM[2] - 255) * w),
    ];
    // JPEG noise leaves the ground a value or two off cream, which shows as a
    // faint rectangle round the logo on a cream page. Anything already within
    // a hair of cream is snapped exactly onto it; real ink is nowhere near
    // this threshold, so nothing visible is touched.
    const offByAHair = out.every((v, k) => Math.abs(v - CREAM[k]) <= 4);
    ground[i*3]   = offByAHair ? CREAM[0] : out[0];
    ground[i*3+1] = offByAHair ? CREAM[1] : out[1];
    ground[i*3+2] = offByAHair ? CREAM[2] : out[2];
  }

  // Measured ink box of this file. Re-measure if the artwork is ever replaced.
  const ART = { left: 152, top: 137, width: 1462, height: 577 };
  const trimmed = await sharp(ground, { raw: { width: W, height: H, channels: 3 } })
    .extract({
      left: ART.left - PAD, top: ART.top - PAD,
      width: ART.width + PAD * 2, height: ART.height + PAD * 2,
    })
    .png().toBuffer();

  // Twice the widest the header renders it, so retina gets one device pixel
  // per image pixel and the browser never has to stretch it.
  const TARGET_WIDTH = 320;
  const meta = await sharp(trimmed).metadata();
  const height = Math.round((TARGET_WIDTH * meta.height) / meta.width);
  writeFileSync(out, await sharp(trimmed)
    .resize(TARGET_WIDTH, height, { kernel: "lanczos3" }).png().toBuffer());
  console.log(`wrote public/logo-wordmark.png  ${TARGET_WIDTH}x${height}  (from ${W}x${H})`);
  return { width: TARGET_WIDTH, height };
}

mkdirSync(app, { recursive: true });

const headerLogo = await buildHeaderLogo();

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
