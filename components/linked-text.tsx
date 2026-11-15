import { splitLinks } from "@/lib/links";

/**
 * Plain text with any links in it made clickable.
 *
 * Which text counts as a link is decided in lib/links.ts, shared with the
 * announcement email so the two always agree. This only draws them.
 */
export function LinkedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        part.kind === "text" ? (
          part.text
        ) : (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words font-medium text-primary underline underline-offset-2 hover:text-primary-deep"
          >
            {/* A long bare address may break anywhere; a name should not. */}
            {part.named ? part.label : <span className="break-all">{part.label}</span>}
          </a>
        ),
      )}
    </>
  );
}
