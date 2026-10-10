# Fonts for the share card

These two files exist only for `app/opengraph-image.tsx`. The rest of the site
loads the same faces through `next/font/google` in `app/layout.tsx` — nothing
here is served to a visitor.

They are vendored rather than fetched at build time so that a network hiccup at
Google can never fail a deploy, and because `satori`, which typesets the card,
reads only `ttf`, `otf` and `woff` — not the `woff2` a browser would be given.

| File | Family | Weight | Used for |
| --- | --- | --- | --- |
| `CormorantGaramond-SemiBold.ttf` | Cormorant Garamond | 600 | the institute's name |
| `SourceSans3-Regular.ttf` | Source Sans 3 | 400 | everything else on the card |

Both are **subsetted to printable ASCII** plus an em dash, a curly apostrophe
and a middot. That is deliberately more than the card currently uses, so that
editing its wording cannot silently blank a glyph — but a character outside
that set, Arabic above all, will not render. To widen the set, re-fetch with a
longer `text=` parameter:

```sh
curl -H "User-Agent: Mozilla/5.0" --get \
  --data-urlencode "family=Cormorant Garamond:wght@600" \
  --data-urlencode "text=<the characters you need>" \
  https://fonts.googleapis.com/css2
```

The bare `Mozilla/5.0` matters: Google serves `woff2` to a modern browser string
and `eot` to an ancient one. Only a plain `Mozilla/5.0` returns TrueType. Follow
the `fonts.gstatic.com` URL in the CSS it hands back to get the file itself.

## Licence

Both families are licensed under the **SIL Open Font License, Version 1.1**,
which permits redistribution in a bundle like this one.

- Cormorant Garamond — Copyright 2015 The Cormorant Project Authors
  <https://github.com/CatharsisFonts/Cormorant>
- Source Sans 3 — Copyright 2010–2023 Adobe
  <https://github.com/adobe-fonts/source-sans>

Full licence text: <https://openfontlicense.org/>
