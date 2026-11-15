import { Fragment } from "react";

/**
 * Plain text with any web address in it made clickable.
 *
 * Teachers paste links to notes and slides into a session's summary — a Gamma
 * doc, a Google Drive folder — and students were left copying them by hand.
 *
 * Only http and https are matched, so nothing like `javascript:` can become a
 * link, and React escapes everything else as text. Trailing punctuation is
 * left out of the link: "see https://example.com." should not send anybody to
 * an address ending in a full stop.
 */

const URL_PATTERN = /(https?:\/\/[^\s<>"]+)/g;
const TRAILING = /[.,;:!?)\]'"]+$/;

export function LinkedText({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        // split() with a capture group puts the matches at the odd indexes.
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;

        const trailing = part.match(TRAILING)?.[0] ?? "";
        const url = trailing ? part.slice(0, -trailing.length) : part;

        return (
          <Fragment key={i}>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-medium text-primary underline underline-offset-2 hover:text-primary-deep"
            >
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </>
  );
}
