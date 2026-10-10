/**
 * The institute's mark: a seedling, drawn as vector.
 *
 * WHY THIS FILE EXISTS AT ALL. The only artwork we have is
 * `public/Mas_tarbiyah_logo.png` — 64x64, of which 25 rows carry any ink, and
 * the sprout inside it is about twelve pixels across. That is a web thumbnail,
 * not a logo file. It cannot be enlarged to a 180px app icon or a 1200x630
 * share card without turning to mush, and the "TARBIYA" wordmark it carries is
 * illegible below roughly 64px anyway — which is why brands with a wordmark use
 * a *mark* in the browser tab, never the words.
 *
 * So the sprout is redrawn here from measurements off those twelve pixels: one
 * large leaf up and to the right, a smaller gold one up and to the left, both
 * springing from a point above a straight stem. In the logo that stem is the
 * letter "I" of TARBIYA, which is the whole joke of the thing — tarbiyah means
 * cultivation, and the word grows a plant out of itself. A standalone mark has
 * to grow its own stem.
 *
 * The silhouette is measured; the exact curve of each leaf is not. IF THE REAL
 * LOGO FILE EVER TURNS UP — a .ai, .svg or .eps from whoever designed it —
 * replace the paths below with the genuine outlines and re-run
 * `node scripts/build-icons.mjs`. Everything downstream regenerates.
 *
 * The original has a third, smaller green leaf tucked under the gold one. It is
 * deliberately left out: at 16px three leaves merge into a smudge, and two
 * leaves plus a stem is the shape that still reads as a seedling in a browser
 * tab. Leaves are also drawn plumper than the original's proportions, because
 * at that size weight is the only thing that survives.
 */

/**
 * Brand colours, taken from the CSS custom properties in `globals.css` rather
 * than sampled from the PNG. They agree: `--primary-deep` resolves to #00341a
 * and the darkest pixel in the logo is #00341c, so the artwork and the
 * stylesheet are the same palette. The tokens win because they are the ones
 * somebody will edit.
 */
export const MARK_COLOURS = {
  /** --primary-deep */
  green: "#00341a",
  /** --primary */
  greenMid: "#034a2a",
  /** --gold */
  gold: "#c19d61",
  /** --background */
  cream: "#f5f3ec",
} as const;

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * A lanceolate leaf — two symmetric arcs from base to tip.
 *
 * The belly sits at 42% rather than halfway, which is what stops it reading as
 * a rugby ball: real leaves are widest below their midpoint.
 */
function leafPath(bx: number, by: number, tx: number, ty: number, w: number): string {
  const dx = tx - bx;
  const dy = ty - by;
  const len = Math.hypot(dx, dy);
  const px = -dy / len; // unit perpendicular
  const py = dx / len;
  const mx = bx + dx * 0.42;
  const my = by + dy * 0.42;
  return (
    `M ${round(bx)} ${round(by)} ` +
    `Q ${round(mx + px * w)} ${round(my + py * w)} ${round(tx)} ${round(ty)} ` +
    `Q ${round(mx - px * w)} ${round(my - py * w)} ${round(bx)} ${round(by)} Z`
  );
}

/** Crude bounding box for a leaf. Only ever used to centre the group. */
function leafBox(bx: number, by: number, tx: number, ty: number, w: number) {
  return {
    x0: Math.min(bx, tx) - w,
    x1: Math.max(bx, tx) + w,
    y0: Math.min(by, ty) - w,
    y1: Math.max(by, ty) + w,
  };
}

// Sprout-local coordinates: the junction of leaves and stem is the origin, and
// y grows downward as it does everywhere else in SVG.
type Leaf = [bx: number, by: number, tx: number, ty: number, w: number];
const BIG_LEAF: Leaf = [0, 0, 17, -18, 7.2];
const GOLD_LEAF: Leaf = [0, 1, -14, -9, 5.2];
const STEM_LENGTH = 16;
const STEM_WIDTH = 3.4;

export type MarkOptions = {
  /** The large leaf and the stem. */
  ink: string;
  /** The smaller leaf. */
  accent: string;
  /** Side of the square the mark is fitted into. */
  size?: number;
  /** Clear space left around the mark on every side. */
  pad?: number;
};

/**
 * The sprout as an SVG `<g>`, scaled and centred inside a `size` box.
 *
 * The centring is computed rather than eyeballed, so changing a leaf's angle
 * does not quietly shove the whole mark off-centre in the tile.
 */
export function markGroup({ ink, accent, size = 64, pad = 6 }: MarkOptions): string {
  const boxes = [
    leafBox(...BIG_LEAF),
    leafBox(...GOLD_LEAF),
    { x0: -STEM_WIDTH / 2, x1: STEM_WIDTH / 2, y0: 0, y1: STEM_LENGTH + STEM_WIDTH / 2 },
  ];
  const x0 = Math.min(...boxes.map((b) => b.x0));
  const x1 = Math.max(...boxes.map((b) => b.x1));
  const y0 = Math.min(...boxes.map((b) => b.y0));
  const y1 = Math.max(...boxes.map((b) => b.y1));

  const inner = size - pad * 2;
  const scale = Math.min(inner / (x1 - x0), inner / (y1 - y0));
  const tx = pad + (inner - (x1 - x0) * scale) / 2 - x0 * scale;
  const ty = pad + (inner - (y1 - y0) * scale) / 2 - y0 * scale;

  return (
    `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale)})">` +
    `<path d="${leafPath(...GOLD_LEAF)}" fill="${accent}"/>` +
    `<path d="${leafPath(...BIG_LEAF)}" fill="${ink}"/>` +
    `<path d="M 0 ${round(-STEM_WIDTH / 4)} L 0 ${STEM_LENGTH}" stroke="${ink}" ` +
    `stroke-width="${STEM_WIDTH}" stroke-linecap="round"/>` +
    `</g>`
  );
}

export type TileOptions = MarkOptions & {
  /** Omit for a transparent ground. */
  bg?: string;
  /** Corner radius. Leave at 0 for the Apple icon: iOS applies its own mask. */
  radius?: number;
};

/** The mark on a square ground, as a complete standalone SVG document. */
export function markSvg({ bg, radius = 0, size = 64, ...rest }: TileOptions): string {
  const ground = bg
    ? `<rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ""} fill="${bg}"/>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}">` +
    ground +
    markGroup({ size, ...rest }) +
    `</svg>`
  );
}
