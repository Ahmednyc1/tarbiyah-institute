/**
 * Finding the links a teacher typed into a session summary.
 *
 * One reader, used in three places that must agree: the portal turns the links
 * into anchors, the announcement email does the same, and the save action asks
 * "did this summary just gain a link?" to decide whether there is news. If the
 * portal and the email ever disagreed about what counts as a link, a student
 * could be told "the notes are up" and find nothing clickable.
 *
 * Two forms are understood:
 *
 *   https://gamma.app/docs/…                      a bare address
 *   [Sciences of the Quran 1](https://gamma.app/…) a named link (Markdown)
 *
 * Only http and https are matched, so nothing like `javascript:` can become a
 * link. Trailing punctuation is left out of a bare address: "see
 * https://example.com." should not point at an address ending in a full stop.
 */

export type LinkPart =
  | { kind: "text"; text: string }
  | { kind: "link"; href: string; label: string; named: boolean };

// A named link, or a bare address. Named first, so the address inside the
// brackets is not also picked up on its own.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
const TRAILING = /[.,;:!?)\]'"]+$/;

export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  const pushText = (t: string) => {
    if (t) parts.push({ kind: "text", text: t });
  };

  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const [whole, name, namedUrl, bare] = m;
    pushText(text.slice(last, m.index));

    if (namedUrl) {
      parts.push({ kind: "link", href: namedUrl, label: name.trim(), named: true });
    } else {
      const trailing = bare.match(TRAILING)?.[0] ?? "";
      const href = trailing ? bare.slice(0, -trailing.length) : bare;
      parts.push({ kind: "link", href, label: href, named: false });
      pushText(trailing);
    }

    last = m.index + whole.length;
  }
  pushText(text.slice(last));

  return parts;
}

/** Whether the text contains at least one link a student could click. */
export function hasLink(text: string | null | undefined): boolean {
  return Boolean(text) && splitLinks(text as string).some((p) => p.kind === "link");
}
