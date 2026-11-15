import { Fragment, type ReactNode } from "react";

/**
 * Plain text with any web address in it made clickable.
 *
 * Teachers paste links to notes and slides into a session's summary — a Gamma
 * doc, a Google Drive folder — and students were left copying them by hand.
 *
 * Two forms are understood:
 *
 *   https://gamma.app/docs/…                      shows the address itself
 *   [Sciences of the Quran 1](https://gamma.app/…) shows the name instead
 *
 * The second is the Markdown convention, chosen because it is the one people
 * may already know and because it needs no extra field on the session. The
 * session editor says how to write it, under the box.
 *
 * Only http and https are matched, so nothing like `javascript:` can become a
 * link, and React escapes everything else as text. Trailing punctuation is
 * left out of a bare link: "see https://example.com." should not send anybody
 * to an address ending in a full stop.
 */

// A named link, or a bare address. Named first, so the address inside the
// brackets is not also picked up on its own.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
const TRAILING = /[.,;:!?)\]'"]+$/;

function Anchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-words font-medium text-primary underline underline-offset-2 hover:text-primary-deep"
    >
      {children}
    </a>
  );
}

export function LinkedText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;

  for (const m of text.matchAll(LINK)) {
    const start = m.index;
    out.push(text.slice(last, start));

    const [whole, name, namedUrl, bare] = m;

    if (namedUrl) {
      out.push(<Anchor key={start} href={namedUrl}>{name.trim()}</Anchor>);
    } else {
      const trailing = bare.match(TRAILING)?.[0] ?? "";
      const url = trailing ? bare.slice(0, -trailing.length) : bare;
      out.push(
        <Fragment key={start}>
          <Anchor href={url}>
            {/* A long bare address may break anywhere; a name should not. */}
            <span className="break-all">{url}</span>
          </Anchor>
          {trailing}
        </Fragment>,
      );
    }

    last = start + whole.length;
  }

  out.push(text.slice(last));
  return <>{out}</>;
}
